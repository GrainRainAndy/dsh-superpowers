/**
 * Unit tests for `lib/skills.js`.
 *
 * Contract source: docs/DESIGN.md "Skill provider contract". These tests touch
 * the filesystem only through the packaged tree and temporary directories.
 */
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'

import {
  PROVIDER_NAME,
  SKILL_RANK,
  SKILL_SOURCE,
  SKILLS_DIRECTORY,
  createSkillProvider,
  listSkillCandidates,
  loadSkillBody,
  parseFrontmatter,
  stripFrontmatter,
} from '../lib/skills.js'
import { EXPECTED_SKILL_NAMES } from './support/fixtures.mjs'

/**
 * Create a temporary skill tree.
 *
 * @param t - node:test context used to register cleanup.
 * @param entries - map of directory name to SKILL.md content; `null` creates an
 *   empty directory. Entries whose name ends in `.md` are written as plain
 *   files at the tree root.
 * @returns the temporary tree root.
 */
async function makeSkillTree(t, entries) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-superpowers-skills-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [name, content] of Object.entries(entries)) {
    if (name.includes('.')) {
      await writeFile(join(root, name), content)
      continue
    }
    await mkdir(join(root, name), { recursive: true })
    if (content !== null) await writeFile(join(root, name, 'SKILL.md'), content)
  }
  return root
}

function skillFile(name, { description = `Use when testing ${name}.`, extra = '' } = {}) {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\nBody of ${name}.\n`
}

describe('constants', () => {
  test('SKILLS_DIRECTORY is the absolute packaged skill tree', () => {
    assert.equal(typeof SKILLS_DIRECTORY, 'string')
    assert.ok(SKILLS_DIRECTORY.startsWith('/'), 'SKILLS_DIRECTORY must be absolute')
    assert.equal(resolve(SKILLS_DIRECTORY), resolve(SKILLS_DIRECTORY, '.'), 'path must normalize to itself')
    const stat = statSync(SKILLS_DIRECTORY)
    assert.ok(stat.isDirectory(), `${SKILLS_DIRECTORY} must be a directory`)
    assert.equal(existsSync(join(SKILLS_DIRECTORY, 'brainstorming', 'SKILL.md')), true)
  })

  test('provider identity, source, and rank match the design contract', () => {
    assert.equal(PROVIDER_NAME, 'superpowers')
    assert.equal(SKILL_SOURCE, 'bundled')
    assert.equal(SKILL_RANK, 600)
  })
})

describe('parseFrontmatter', () => {
  test('parses a leading block and returns the body after it', () => {
    const text = '---\nname: alpha\ndescription: Use when alpha.\n---\n# Alpha\n\nBody.\n'
    const { data, body } = parseFrontmatter(text)
    assert.deepEqual(data, { name: 'alpha', description: 'Use when alpha.' })
    assert.equal(body, '# Alpha\n\nBody.\n')
  })

  test('keeps unknown keys in data', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: d\nlicense: MIT\nallowed-tools: Read, Bash\n---\n')
    assert.equal(data.license, 'MIT')
    assert.equal(data['allowed-tools'], 'Read, Bash')
  })

  test('removes exactly one matching surrounding double-quote pair', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: "quoted: value"\n---\n')
    assert.equal(data.description, 'quoted: value')
  })

  test('removes exactly one matching surrounding single-quote pair', () => {
    const { data } = parseFrontmatter("---\nname: alpha\ndescription: 'single quoted'\n---\n")
    assert.equal(data.description, 'single quoted')
  })

  test('preserves unbalanced surrounding quotes', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: "unterminated\n---\n')
    assert.equal(data.description, '"unterminated')
    const single = parseFrontmatter("---\nname: alpha\ndescription: unterminated'\n---\n")
    assert.equal(single.data.description, "unterminated'")
  })

  test('a colon inside a value does not split the pair', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: Use when: any reason applies\n---\n')
    assert.equal(data.description, 'Use when: any reason applies')
  })

  test('folds indented continuation lines into the previous key with single spaces', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: first line\n  second line\n  third line\n---\n')
    assert.equal(data.description, 'first line second line third line')
  })

  test('a blank line ends the folding run', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: first\n\n  orphan continuation\nlicense: MIT\n---\n')
    assert.equal(data.description, 'first')
    assert.equal(data.license, 'MIT')
    assert.equal(data['orphan continuation'], undefined)
  })

  test('an empty value parses as an empty string', () => {
    const { data } = parseFrontmatter('---\nname: alpha\ndescription: d\nwhenToUse:\n---\n')
    assert.equal(data.whenToUse, '')
  })

  test('accepts CRLF line endings', () => {
    const { data, body } = parseFrontmatter('---\r\nname: alpha\r\ndescription: d\r\n---\r\nBody\r\n')
    assert.deepEqual(data, { name: 'alpha', description: 'd' })
    assert.equal(body, 'Body\r\n')
  })

  test('missing frontmatter returns the whole text as the body', () => {
    const text = '# No frontmatter\n\nJust prose.\n'
    assert.deepEqual(parseFrontmatter(text), { data: {}, body: text })
  })

  test('an unterminated frontmatter block is treated as no frontmatter', () => {
    const text = '---\nname: alpha\nthere is no closing delimiter\n'
    assert.deepEqual(parseFrontmatter(text), { data: {}, body: text })
  })

  test('frontmatter delimiters must start the file', () => {
    const text = '\n---\nname: alpha\n---\nBody\n'
    assert.deepEqual(parseFrontmatter(text), { data: {}, body: text })
  })

  test('stripFrontmatter keeps only the body', () => {
    const raw = '---\nname: alpha\ndescription: d\n---\n\n# Alpha\n'
    assert.equal(stripFrontmatter(raw), '\n# Alpha\n')
    assert.equal(stripFrontmatter('no frontmatter'), 'no frontmatter')
  })
})

describe('listSkillCandidates on the packaged tree', () => {
  test('discovers all 15 skills, sorted by name', async () => {
    const candidates = await listSkillCandidates()
    assert.equal(candidates.length, EXPECTED_SKILL_NAMES.length)
    assert.deepEqual(candidates.map((candidate) => candidate.name), EXPECTED_SKILL_NAMES)
    const order = [...candidates].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    assert.deepEqual(candidates.map((candidate) => candidate.name), order.map((candidate) => candidate.name))
  })

  test('candidates carry the registry fields from the design contract', async () => {
    const candidates = await listSkillCandidates()
    for (const candidate of candidates) {
      assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      assert.equal(typeof candidate.description, 'string')
      assert.ok(candidate.description.length > 0, `${candidate.name} needs a description`)
      assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
      assert.equal(candidate.provider, 'superpowers')
      assert.equal(candidate.source, 'bundled')
      assert.equal(candidate.rank, 600)
      assert.deepEqual(Object.keys(candidate.resourceBase), ['kind', 'path'])
      assert.equal(candidate.resourceBase.kind, 'directory')
      assert.equal(resolve(candidate.resourceBase.path), resolve(SKILLS_DIRECTORY, candidate.name))
      assert.ok(statSync(candidate.resourceBase.path).isDirectory())
      assert.ok(candidate.locator.startsWith('/'), 'locator must be absolute')
      assert.equal(resolve(candidate.locator), resolve(SKILLS_DIRECTORY, candidate.name, 'SKILL.md'))
      assert.equal(candidate.path, candidate.locator)
      assert.equal(dirname(candidate.locator), candidate.resourceBase.path)
      assert.ok(statSync(candidate.locator).isFile())
    }
  })

  test('every packaged body is non-empty and frontmatter-free', async () => {
    const candidates = await listSkillCandidates()
    for (const candidate of candidates) {
      const body = stripFrontmatter(await readFile(candidate.locator, 'utf8'))
      assert.ok(body.trim().length > 0, `${candidate.name} has an empty body`)
      assert.ok(!/^---\r?\n/.test(body), `${candidate.name} body still starts with a frontmatter delimiter`)
      const { data } = parseFrontmatter(await readFile(candidate.locator, 'utf8'))
      assert.equal(data.name, candidate.name)
      assert.equal(data.description, candidate.description)
    }
  })

  test('ignores non-directory children and dot-directories', async (t) => {
    const root = await makeSkillTree(t, {
      'README.md': 'not a skill\n',
      '.hidden': skillFile('hidden'),
      alpha: skillFile('alpha'),
    })
    await writeFile(join(root, 'notes.txt'), 'x')
    const candidates = await listSkillCandidates({ directory: root })
    assert.deepEqual(candidates.map((candidate) => candidate.name), ['alpha'])
  })

  test('honors an explicit directory option', async (t) => {
    const root = await makeSkillTree(t, { omega: skillFile('omega', { description: 'Use only in tests.' }) })
    const [candidate] = await listSkillCandidates({ directory: root })
    assert.equal(candidate.name, 'omega')
    assert.equal(candidate.description, 'Use only in tests.')
    assert.equal(candidate.locator, join(root, 'omega', 'SKILL.md'))
    assert.equal(candidate.resourceBase.path, join(root, 'omega'))
  })
})

// DESIGN.md also lists "two directories resolve to one name" as a load-time
// failure. With the required name == directory rule that branch is structurally
// unreachable (no two directory children share a name, and a mismatch throws
// first), so it is recorded in docs/VERIFICATION.md instead of asserted here.
describe('listSkillCandidates failure paths', () => {
  test('rejects an invalid (non-kebab) frontmatter name', async (t) => {
    const root = await makeSkillTree(t, { bad: '---\nname: Not_A_Skill\ndescription: d\n---\nbody\n' })
    await assert.rejects(listSkillCandidates({ directory: root }), /invalid frontmatter name/)
  })

  test('rejects a missing frontmatter name', async (t) => {
    const root = await makeSkillTree(t, { nameless: '---\ndescription: d\n---\nbody\n' })
    await assert.rejects(listSkillCandidates({ directory: root }), /invalid frontmatter name/)
  })

  test('rejects a frontmatter name that differs from the directory', async (t) => {
    const root = await makeSkillTree(t, { alpha: skillFile('beta') })
    await assert.rejects(listSkillCandidates({ directory: root }), /must match the directory/)
  })

  test('rejects a missing description', async (t) => {
    const root = await makeSkillTree(t, { alpha: '---\nname: alpha\n---\nbody\n' })
    await assert.rejects(listSkillCandidates({ directory: root }), /no frontmatter description/)
  })

  test('rejects an empty description', async (t) => {
    const root = await makeSkillTree(t, { alpha: '---\nname: alpha\ndescription:\n---\nbody\n' })
    await assert.rejects(listSkillCandidates({ directory: root }), /no frontmatter description/)
  })

  test('rejects a directory child without SKILL.md', async (t) => {
    const root = await makeSkillTree(t, { empty: null })
    await assert.rejects(listSkillCandidates({ directory: root }), (error) => error?.code === 'ENOENT')
  })

  test('rejects a missing tree directory', async () => {
    await assert.rejects(
      listSkillCandidates({ directory: join(tmpdir(), `dsh-superpowers-missing-${process.pid}`) }),
      (error) => error?.code === 'ENOENT',
    )
  })
})

describe('loadSkillBody', () => {
  test('loads a package skill body without frontmatter', async () => {
    const [candidate] = (await listSkillCandidates()).filter((entry) => entry.name === 'brainstorming')
    const body = await loadSkillBody(candidate)
    assert.equal(body, stripFrontmatter(await readFile(candidate.locator, 'utf8')))
    assert.ok(body.length > 1000, 'brainstorming body should be substantial')
    assert.ok(!/^---\r?\n/.test(body))
  })

  test('rejects when the skill file is missing', async () => {
    await assert.rejects(
      loadSkillBody({ locator: join(tmpdir(), `dsh-superpowers-missing-${process.pid}.md`) }),
      (error) => error?.code === 'ENOENT',
    )
  })
})

describe('createSkillProvider', () => {
  test('reports the provider name and lists the packaged candidates', async () => {
    const provider = createSkillProvider()
    assert.equal(provider.name, 'superpowers')
    const candidates = await provider.list()
    assert.equal(candidates.length, EXPECTED_SKILL_NAMES.length)
    assert.deepEqual(candidates.map((candidate) => candidate.name), EXPECTED_SKILL_NAMES)
  })

  test('caches discovery between list calls', async () => {
    const provider = createSkillProvider()
    const first = await provider.list()
    const second = await provider.list()
    assert.equal(first, second, 'list() should reuse the discovery result')
  })

  test('get() returns the definition fields plus body content', async () => {
    const provider = createSkillProvider()
    const candidates = await provider.list()
    for (const candidate of candidates) {
      const definition = await provider.get(candidate)
      assert.equal(definition.name, candidate.name)
      assert.equal(definition.description, candidate.description)
      assert.deepEqual(definition.invocation, candidate.invocation)
      assert.equal(definition.source, candidate.source)
      assert.equal(definition.provider, candidate.provider)
      assert.deepEqual(definition.resourceBase, candidate.resourceBase)
      assert.equal(definition.path, candidate.path)
      assert.equal(typeof definition.content, 'string')
      assert.ok(definition.content.trim().length > 0)
      assert.ok(!/^---\r?\n/.test(definition.content), `${candidate.name} leaked frontmatter`)
      assert.equal(definition.content, await loadSkillBody(candidate))
    }
  })

  test('get() rejects for a candidate whose file disappeared', async (t) => {
    const root = await makeSkillTree(t, { alpha: skillFile('alpha') })
    const provider = createSkillProvider({ directory: root })
    const [candidate] = await provider.list()
    await rm(join(root, 'alpha', 'SKILL.md'))
    await assert.rejects(provider.get(candidate), (error) => error?.code === 'ENOENT')
  })
})
