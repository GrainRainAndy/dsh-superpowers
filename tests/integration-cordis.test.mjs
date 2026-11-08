/**
 * Cordis integration test for the dsh-superpowers Host plugin.
 *
 * Contract source: docs/DESIGN.md "Testing contract" and "Host plugin
 * contract". This suite mounts the *real* extracted DSH runtime — the
 * `SkillRegistry` service, the `SystemPrompt` service, then this package's
 * plugin — and asserts the observable results, not the implementation.
 *
 * The suite skips with an explicit message when the runtime is unavailable:
 * set `DSH_RUNTIME_ROOT` to an extracted dsh package root (or to its
 * `node_modules/@deepseek-ai` directory).
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, test } from 'node:test'

import * as pluginModule from '../lib/index.js'
import {
  BOOTSTRAP_ALREADY_LOADED,
  BOOTSTRAP_CLOSING_TAG,
  BOOTSTRAP_HEADLINE,
  BOOTSTRAP_MARKER,
  SUPERPOWERS_SECTION_NAME,
  SUPERPOWERS_SECTION_ORDER,
} from '../lib/prompt.js'
import { SKILL_RANK, stripFrontmatter } from '../lib/skills.js'
import {
  EXPECTED_SKILL_NAMES,
  PACKAGE_ROOT,
  SKILLS_DIRECTORY,
  SKILLS_WITH_RESOURCES,
  resolveRuntime,
  runtimeSkipMessage,
} from './support/fixtures.mjs'

const runtime = resolveRuntime()
const CWD = PACKAGE_ROOT
const ROOT_AGENT = { session: { header: { delegationDepth: 0 } } }
const DELEGATED_AGENT = { session: { header: { delegationDepth: 1 } } }
const DEEP_DELEGATED_AGENT = { session: { header: { delegationDepth: 2 } } }

/** Files the bootstrap composition reads, relative to the packaged skill tree. */
const USING_SUPERPOWERS_FILE = join(SKILLS_DIRECTORY, 'using-superpowers', 'SKILL.md')
const DSH_TOOLS_FILE = join(SKILLS_DIRECTORY, 'using-superpowers', 'references', 'dsh-tools.md')

describe('plugin module shape (no runtime required)', () => {
  test('exports exactly the function-plugin form', () => {
    assert.equal(pluginModule.name, 'superpowers')
    assert.deepEqual(pluginModule.inject, ['skills', 'systemPrompt'])
    assert.equal(typeof pluginModule.apply, 'function')
    assert.equal('Config' in pluginModule, false, 'DESIGN requires no Config export')
    assert.equal('default' in pluginModule, false)
  })
})

describe('Cordis integration', { skip: runtime.available ? false : runtimeSkipMessage(runtime) }, () => {
  /** @type {import('node:test').TestContext['before'] | undefined} */
  let ctx
  let pluginFiber
  let capturedSection
  let disposed = false
  let helpers

  before(async () => {
    const { Context } = await import(runtime.urls.cordis)
    const skillModule = await import(runtime.urls.skill)
    const { default: SkillRegistry, BUNDLED_SKILL_RANK, renderSkillContent } = skillModule
    const { default: SystemPrompt, renderPrompt } = await import(runtime.urls.systemPrompt)
    helpers = { renderPrompt, renderSkillContent, BUNDLED_SKILL_RANK }

    ctx = new Context()
    await ctx.plugin(SkillRegistry).await?.()
    await ctx.plugin(SystemPrompt).await?.()
    assert.equal(typeof ctx.skills?.list, 'function', 'SkillRegistry must provide ctx.skills')
    assert.equal(typeof ctx.systemPrompt?.assemble, 'function', 'SystemPrompt must provide ctx.systemPrompt')

    // Capture the plugin's section registration through the same proxy path the
    // plugin itself uses, while preserving Cordis service-call tracking (the
    // wrapper must forward the tracker-provided `this`, not bind the instance).
    const service = ctx.systemPrompt
    const prototype = Object.getPrototypeOf(service)
    const originalSection = prototype.section
    Object.defineProperty(service, 'section', {
      configurable: true,
      writable: true,
      value: function captureSection(section) {
        capturedSection = section
        return Reflect.apply(originalSection, this, [section])
      },
    })

    pluginFiber = ctx.plugin(pluginModule)
    await pluginFiber.await?.()
  })

  after(async () => {
    await disposePlugin()
  })

  async function disposePlugin() {
    if (disposed || pluginFiber === undefined) return
    disposed = true
    await pluginFiber.dispose()
  }

  test('catalog contains exactly the 15 packaged skills, sorted', async () => {
    const catalog = await ctx.skills.list({ cwd: CWD })
    assert.equal(catalog.length, EXPECTED_SKILL_NAMES.length)
    assert.deepEqual(catalog.map((summary) => summary.name), EXPECTED_SKILL_NAMES)
  })

  test('catalog summaries carry provider, source, invocation, and resourceBase', async () => {
    const catalog = await ctx.skills.list({ cwd: CWD })
    for (const summary of catalog) {
      assert.equal(summary.description.length > 0, true, `${summary.name} needs a description`)
      assert.equal(summary.provider, 'superpowers')
      assert.equal(summary.source, 'bundled')
      assert.deepEqual(summary.invocation, { modelInvocable: true, userInvocable: true })
      assert.equal(summary.resourceBase.kind, 'directory')
      assert.equal(resolve(summary.resourceBase.path), resolve(SKILLS_DIRECTORY, summary.name))
      assert.equal((await stat(summary.resourceBase.path)).isDirectory(), true)
      assert.equal(resolve(summary.path), resolve(SKILLS_DIRECTORY, summary.name, 'SKILL.md'))
      // The registry drops rank/locator from summaries; both are provider inputs.
      assert.equal('rank' in summary, false)
      assert.equal('locator' in summary, false)
      assert.equal('content' in summary, false, 'summaries must not carry bodies')
    }
  })

  test('every skill loads through ctx.skills.get with a valid definition', async () => {
    for (const name of EXPECTED_SKILL_NAMES) {
      const skill = await ctx.skills.get(name, { cwd: CWD })
      assert.ok(skill, `${name} should be loadable`)
      assert.equal(skill.name, name)
      assert.equal(skill.description.length > 0, true)
      assert.equal(skill.provider, 'superpowers')
      assert.equal(skill.source, 'bundled')
      assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true })
      assert.equal(skill.resourceBase.kind, 'directory')
      assert.equal(resolve(skill.resourceBase.path), resolve(SKILLS_DIRECTORY, name))
      assert.equal(resolve(skill.path), resolve(SKILLS_DIRECTORY, name, 'SKILL.md'))
      assert.equal(typeof skill.content, 'string')

      const source = await readFile(join(SKILLS_DIRECTORY, name, 'SKILL.md'), 'utf8')
      assert.equal(skill.content, stripFrontmatter(source), `${name} body must equal the frontmatter-stripped file`)
      assert.equal(/^---\r?\n/.test(skill.content), false, `${name} leaked frontmatter`)
      assert.equal(/^name:\s*\S*\r?\ndescription:/m.test(skill.content.slice(0, 300)), false, `${name} leaked frontmatter fields`)
      assert.equal(skill.content.trim().length > 0, true)
    }
  })

  test('loaded bodies are the exact packaged bodies (spot checks)', async () => {
    for (const name of ['brainstorming', 'using-superpowers', 'writing-skills']) {
      const skill = await ctx.skills.get(name, { cwd: CWD })
      const source = await readFile(join(SKILLS_DIRECTORY, name, 'SKILL.md'), 'utf8')
      assert.equal(skill.content, stripFrontmatter(source))
    }
  })

  test('resourceBase points at the real skill directory holding referenced files', async () => {
    for (const [name, resources] of Object.entries(SKILLS_WITH_RESOURCES)) {
      const skill = await ctx.skills.get(name, { cwd: CWD })
      assert.ok(skill, `${name} should load`)
      assert.equal(resolve(skill.resourceBase.path), resolve(SKILLS_DIRECTORY, name))
      for (const resource of resources) {
        const target = join(skill.resourceBase.path, resource)
        const info = await stat(target).catch(() => undefined)
        assert.ok(info !== undefined, `${name}/${resource} should resolve under resourceBase`)
        assert.equal(info.isFile(), true, `${name}/${resource} should be a file`)
      }
    }
  })

  test('the skill-tool rendering path exposes resourceBase and the body verbatim', async () => {
    const skill = await ctx.skills.get('brainstorming', { cwd: CWD })
    const rendered = helpers.renderSkillContent(skill)
    assert.ok(rendered.includes('<skill_content name="brainstorming">'))
    assert.ok(rendered.includes('<skill_resources>'))
    assert.ok(rendered.includes(`Base directory for this skill: ${skill.resourceBase.path}`))
    assert.ok(rendered.includes('<skill_instructions>'))
    assert.ok(rendered.includes(skill.content), 'the loaded body must be embedded verbatim')
    assert.equal(rendered.includes('name: brainstorming'), false, 'frontmatter must not reach the model')
  })

  test('unknown and invalid names resolve to undefined', async () => {
    assert.equal(await ctx.skills.get('not-a-skill', { cwd: CWD }), undefined)
    assert.equal(await ctx.skills.get('Brainstorming', { cwd: CWD }), undefined)
    assert.equal(await ctx.skills.get('', { cwd: CWD }), undefined)
  })

  test('registers section superpowers:bootstrap with order 6000 and interpolate false', () => {
    assert.ok(capturedSection, 'the plugin must register a prompt section')
    assert.equal(capturedSection.name, SUPERPOWERS_SECTION_NAME)
    assert.equal(capturedSection.order, SUPERPOWERS_SECTION_ORDER)
    assert.equal(capturedSection.order, 6000)
    assert.equal(capturedSection.interpolate, false, 'skill prose must reach the model literally')
    assert.equal(typeof capturedSection.text, 'function', 'delegation needs a context-dependent text provider')
  })

  test('runtime BUNDLED_SKILL_RANK matches the provider rank', () => {
    assert.equal(helpers.BUNDLED_SKILL_RANK, 600)
    assert.equal(helpers.BUNDLED_SKILL_RANK, SKILL_RANK)
  })

  test('root assembly carries the full bootstrap with the mapping appended last', async () => {
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    const section = assembly.sections.find((entry) => entry.name === SUPERPOWERS_SECTION_NAME)
    assert.ok(section, 'root assembly must include the bootstrap section')
    assert.equal(section.interpolate, false)

    const text = section.text
    const usingBody = stripFrontmatter(await readFile(USING_SUPERPOWERS_FILE, 'utf8')).trim()
    const mapping = (await readFile(DSH_TOOLS_FILE, 'utf8')).trim()

    assert.equal(text.startsWith(`${BOOTSTRAP_MARKER}\n${BOOTSTRAP_HEADLINE}\n\n`), true)
    assert.equal(text.includes(BOOTSTRAP_ALREADY_LOADED), true)
    assert.ok(text.includes(usingBody), 'the using-superpowers body must be in the prompt verbatim')
    assert.ok(text.includes(mapping), 'the DSH tool mapping must be in the prompt verbatim')
    assert.ok(text.indexOf(mapping) > text.indexOf(usingBody), 'mapping must follow the skill body')
    assert.equal(text.endsWith(`${mapping}\n${BOOTSTRAP_CLOSING_TAG}`), true, 'mapping must be appended last')
    assert.equal(countOccurrences(text, BOOTSTRAP_MARKER), 1)
    assert.equal(countOccurrences(text, BOOTSTRAP_CLOSING_TAG), 1)

    // Prompt-cost guard: skill bodies (600 KiB on disk) must stay out of the
    // prompt; only the bootstrap + mapping enter it.
    assert.ok(text.length > 2000, 'bootstrap should be substantial')
    assert.ok(text.length < 24 * 1024, `bootstrap is unexpectedly large: ${text.length} chars`)
  })

  test('bootstrap section sorts after first-party guidance and before harness sections', async () => {
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    const names = assembly.sections.map((section) => section.name)
    const bootstrapAt = names.indexOf(SUPERPOWERS_SECTION_NAME)
    assert.ok(bootstrapAt >= 0)
    if (names.includes('harness:identity')) assert.ok(names.indexOf('harness:identity') < bootstrapAt)
    if (names.includes('deployment:persona-suffix')) assert.ok(bootstrapAt < names.indexOf('deployment:persona-suffix'))
  })

  test('root rendered prompt contains the bootstrap exactly once', async () => {
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    const rendered = helpers.renderPrompt(assembly)
    assert.equal(countOccurrences(rendered, BOOTSTRAP_MARKER), 1)
    assert.ok(rendered.includes(BOOTSTRAP_HEADLINE))
  })

  test('a missing agent is treated as a top-level session', async () => {
    const assembly = await ctx.systemPrompt.assemble({})
    const section = assembly.sections.find((entry) => entry.name === SUPERPOWERS_SECTION_NAME)
    assert.ok(section)
    assert.ok(section.text.includes(BOOTSTRAP_MARKER))
    assert.ok(helpers.renderPrompt(assembly).includes(BOOTSTRAP_MARKER))
  })

  test('delegated sessions get an empty section, dropped at render', async () => {
    const delegatedAgents = [DELEGATED_AGENT, DEEP_DELEGATED_AGENT, { options: { subagentDepth: 1 } }]
    for (const agent of delegatedAgents) {
      const assembly = await ctx.systemPrompt.assemble({ agent })
      const section = assembly.sections.find((entry) => entry.name === SUPERPOWERS_SECTION_NAME)
      assert.ok(section, 'the section registration remains for the whole plugin lifetime')
      assert.equal(section.text, '', 'delegated sessions must receive an empty section')
      const rendered = helpers.renderPrompt(assembly)
      assert.equal(rendered.includes(BOOTSTRAP_MARKER), false, 'empty sections are dropped at render')
      assert.equal(rendered.includes(BOOTSTRAP_HEADLINE), false)
    }
  })

  test('plugin disposal removes both the provider and the prompt section', async () => {
    await disposePlugin()
    const catalog = await ctx.skills.list({ cwd: CWD })
    assert.deepEqual(catalog, [], 'disposing the plugin must unregister the skill provider')
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    assert.equal(assembly.sections.some((entry) => entry.name === SUPERPOWERS_SECTION_NAME), false)
    assert.equal(helpers.renderPrompt(assembly).includes(BOOTSTRAP_MARKER), false)
  })

  test('remounting after disposal restores the provider and section (HMR reload path)', async () => {
    assert.equal(disposed, true, 'this test documents the reload path after disposal')
    pluginFiber = ctx.plugin(pluginModule)
    await pluginFiber.await?.()
    disposed = false

    const catalog = await ctx.skills.list({ cwd: CWD })
    assert.deepEqual(catalog.map((summary) => summary.name), EXPECTED_SKILL_NAMES)
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    const section = assembly.sections.find((entry) => entry.name === SUPERPOWERS_SECTION_NAME)
    assert.ok(section, 'a reloaded plugin must register the section again')
    assert.ok(helpers.renderPrompt(assembly).includes(BOOTSTRAP_MARKER))
  })

})

function countOccurrences(haystack, needle) {
  let count = 0
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1
  return count
}


const precedenceSkip = !runtime.available
  ? runtimeSkipMessage(runtime)
  : runtime.has.skillFilesystem
    ? false
    : 'DSH runtime lacks @deepseek-ai/dsh-skill-filesystem/lib/index.js; cannot verify bundled-rank precedence'

describe('bundled rank precedence (filesystem provider)', { skip: precedenceSkip }, () => {
  let ctx
  let projectDir

  before(async () => {
    const { Context } = await import(runtime.urls.cordis)
    const { default: SkillRegistry } = await import(runtime.urls.skill)
    const { default: SystemPrompt } = await import(runtime.urls.systemPrompt)
    const filesystemSkills = await import(runtime.urls.skillFilesystem)

    projectDir = await mkdtemp(join(tmpdir(), 'dsh-superpowers-precedence-'))
    const customSkills = join(projectDir, 'custom-skills')
    await mkdir(join(customSkills, 'brainstorming'), { recursive: true })
    await writeFile(
      join(customSkills, 'brainstorming', 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Custom root override of brainstorming.\n---\n\n# Custom override body\n',
    )

    ctx = new Context()
    await ctx.plugin(SkillRegistry).await?.()
    await ctx.plugin(SystemPrompt).await?.()
    await ctx.plugin(filesystemSkills, {
      includeDefaultRoots: false,
      customSkillDirs: [customSkills],
      watch: false,
    }).await?.()
    await ctx.plugin(pluginModule).await?.()
  })

  after(async () => {
    if (projectDir !== undefined) await rm(projectDir, { recursive: true, force: true })
  })

  test('a lower-rank custom root shadows a packaged skill of the same name', async () => {
    const catalog = await ctx.skills.list({ cwd: projectDir })
    assert.equal(catalog.length, EXPECTED_SKILL_NAMES.length)
    const winner = catalog.find((summary) => summary.name === 'brainstorming')
    assert.ok(winner)
    assert.equal(winner.provider, 'filesystem', 'the lower-rank provider must win the catalog row')
    assert.equal(winner.source, 'custom')
    assert.equal(winner.description, 'Custom root override of brainstorming.')

    const loaded = await ctx.skills.get('brainstorming', { cwd: projectDir })
    assert.equal(loaded.provider, 'filesystem')
    assert.equal(loaded.content.trim(), '# Custom override body')

    const untouched = await ctx.skills.get('writing-plans', { cwd: projectDir })
    assert.equal(untouched.provider, 'superpowers')

    // The bootstrap still comes from the packaged file: the installed tree is
    // the prompt source, independent of catalog shadowing.
    const assembly = await ctx.systemPrompt.assemble({ agent: ROOT_AGENT })
    const section = assembly.sections.find((entry) => entry.name === SUPERPOWERS_SECTION_NAME)
    assert.ok(section.text.includes(BOOTSTRAP_MARKER))
  })
})
