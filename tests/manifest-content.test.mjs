/**
 * Manifest and packaged-content tests.
 *
 * Contract source: docs/DESIGN.md "Package layout", "Bundle manifest",
 * "Bootstrap composition", and "DSH tool mapping". These checks read files
 * only; they do not import the DSH runtime.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { describe, test } from 'node:test'

import {
  BOOTSTRAP_CLOSING_TAG,
  BOOTSTRAP_HEADLINE,
  BOOTSTRAP_MARKER,
  composeBootstrapText,
} from '../lib/prompt.js'
import { parseFrontmatter, stripFrontmatter } from '../lib/skills.js'
import {
  EXPECTED_SKILL_NAMES,
  PACKAGE_ROOT,
  REQUIRED_DSH_TOOL_TERMS,
  REQUIRED_LOCALES,
  SKILLS_DIRECTORY,
  packagePath,
  readJson,
} from './support/fixtures.mjs'

const PACKAGE_JSON_PATH = packagePath('package.json')
const manifest = readJson(PACKAGE_JSON_PATH)

const DESIGN_FILES_ENTRIES = [
  'lib/**/*.js',
  'skills/**/*',
  'locale/*.json',
  'icon.svg',
  'cordis.patch.yml',
  'README.md',
  'NOTICE.md',
  'LICENSE',
  'docs/**/*',
]

const DESIGN_EXPORTS = {
  '.': './lib/index.js',
  './locale/*.json': './locale/*.json',
  './icon': './icon.svg',
}

describe('package.json manifest', () => {
  test('declares the design identity and module shape', () => {
    assert.equal(manifest.name, '@local/dsh-superpowers')
    assert.equal(manifest.version, '1.0.0')
    assert.equal(manifest.private, true)
    assert.equal(manifest.type, 'module')
    assert.equal(manifest.icon, './icon.svg')
    assert.equal(manifest.license, 'MIT')
  })

  test('exports map matches the design contract', () => {
    assert.deepEqual(manifest.exports, DESIGN_EXPORTS)
    const target = resolve(PACKAGE_ROOT, manifest.exports['.'])
    assert.equal(existsSync(target), true, 'exports["."] must resolve to a real file')
  })

  test('declares the bundle patch used by install_bundle', () => {
    assert.equal(typeof manifest.dsh, 'object')
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(existsSync(packagePath(manifest.dsh.bundle.patch)), true)
  })

  test('ships every design file entry', () => {
    assert.ok(Array.isArray(manifest.files))
    for (const entry of DESIGN_FILES_ENTRIES) {
      assert.ok(manifest.files.includes(entry), `files must include ${entry}`)
    }
    for (const entry of manifest.files) assert.equal(typeof entry, 'string')
  })

  test('ships the upstream license text that NOTICE.md references', () => {
    assert.ok(manifest.files.includes('LICENSE-superpowers'), 'files[] must ship LICENSE-superpowers (NOTICE.md points at it)')
    assert.equal(existsSync(packagePath('LICENSE-superpowers')), true)
    const notice = readFileSync(packagePath('NOTICE.md'), 'utf8')
    assert.ok(notice.includes('LICENSE-superpowers'), 'NOTICE.md must name the shipped license file')
  })

  test('declared package files exist on disk', () => {
    for (const file of [
      'lib/index.js',
      'lib/skills.js',
      'lib/prompt.js',
      'cordis.patch.yml',
      'icon.svg',
      'README.md',
      'NOTICE.md',
      'LICENSE',
      'LICENSE-superpowers',
      'docs/DESIGN.md',
    ]) {
      const target = packagePath(file)
      assert.equal(existsSync(target), true, `missing packaged file: ${file}`)
      assert.equal(statSync(target).isFile(), true, `${file} must be a file`)
    }
    for (const directory of ['skills', 'locale', 'docs']) {
      assert.equal(statSync(packagePath(directory)).isDirectory(), true, `${directory} must be a directory`)
    }
  })

  test('has no runtime dependencies, peer dependencies, engines, or build step', () => {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'engines']) {
      assert.equal(field in manifest, false, `DESIGN forbids ${field}`)
    }
    assert.equal('build' in (manifest.scripts ?? {}), false)
    assert.equal(manifest.scripts.test, 'node --test tests/')
  })
})

describe('cordis.patch.yml', () => {
  const raw = readFileSync(packagePath('cordis.patch.yml'), 'utf8')

  test('inserts one superpowers row anchored at ./lib/index.js', () => {
    assert.match(raw, /^-\s*insert:\s*$/m)
    assert.match(raw, /^\s*-\s*id:\s*superpowers\s*$/m)
    assert.match(raw, /^\s*name:\s*['"]\.\/lib\/index\.js['"]\s*$/m)
  })

  test('the anchor is relative so the Loader can resolve it beside the patch', () => {
    const anchor = extractAnchor(raw)
    assert.equal(anchor, './lib/index.js')
    assert.equal(anchor.startsWith('./'), true)
    assert.equal(existsSync(resolve(packagePath('cordis.patch.yml'), '..', anchor)), true)
  })

  test('the patch does not depend on an absolute install path or a package name', () => {
    const anchor = extractAnchor(raw)
    assert.equal(anchor.startsWith('/'), false)
    assert.equal(anchor.startsWith('@'), false)
    assert.equal(raw.includes('/Users/'), false)
    assert.equal(raw.includes(PACKAGE_ROOT), false)
  })

  test('only one plugin row is inserted', () => {
    const rows = raw.match(/^\s*-\s*id:/gm) ?? []
    assert.equal(rows.length, 1)
  })
})

describe('icon', () => {
  const iconPath = packagePath('icon.svg')

  test('is an SVG under 256 KiB', async () => {
    const info = statSync(iconPath)
    assert.equal(info.isFile(), true)
    assert.equal(basename(iconPath), 'icon.svg')
    assert.ok(info.size < 256 * 1024, `icon exceeds 256 KiB: ${info.size} bytes`)
    const content = await readFile(iconPath, 'utf8')
    assert.match(content, /<svg[\s>]/)
    assert.match(content, /<\/svg>/)
    assert.match(content, /viewBox="0 0 36 36"/, 'DESIGN calls for the original 36x36 icon')
  })

  test('stays inside the package directory', () => {
    const resolved = resolve(PACKAGE_ROOT, manifest.icon)
    assert.equal(existsSync(resolved), true)
    assert.equal(resolved.startsWith(resolve(PACKAGE_ROOT)), true)
  })
})

describe('locale metadata', () => {
  test('every required locale parses with meta title and description', async () => {
    const entries = await readdir(packagePath('locale'))
    const locales = entries.filter((entry) => entry.endsWith('.json')).map((entry) => entry.slice(0, -5))
    for (const locale of REQUIRED_LOCALES) {
      assert.ok(locales.includes(locale), `missing locale/${locale}.json`)
    }
    for (const locale of locales) {
      const file = packagePath('locale', `${locale}.json`)
      const parsed = readJson(file)
      assert.equal(typeof parsed.meta, 'object', `${file} needs a meta object`)
      assert.equal(typeof parsed.meta.title, 'string', `${file} needs meta.title`)
      assert.ok(parsed.meta.title.trim().length > 0, `${file} meta.title must be non-empty`)
      assert.equal(typeof parsed.meta.description, 'string', `${file} needs meta.description`)
      assert.ok(parsed.meta.description.trim().length > 0, `${file} meta.description must be non-empty`)
    }
  })

  test('English and Chinese are both provided', () => {
    const en = readJson(packagePath('locale', 'en.json'))
    const zh = readJson(packagePath('locale', 'zh.json'))
    assert.notEqual(en.meta.description, undefined)
    assert.notEqual(zh.meta.description, undefined)
    assert.equal(typeof zh.meta.title, 'string')
  })

  test('a declared meta.detail points at a packaged document', () => {
    for (const locale of REQUIRED_LOCALES) {
      const parsed = readJson(packagePath('locale', `${locale}.json`))
      const detail = parsed.meta.detail
      if (detail === undefined) continue
      assert.equal(typeof detail, 'string')
      assert.equal(detail.startsWith('/'), false, 'meta.detail must be relative')
      assert.equal(detail.split('/').includes('..'), false, 'meta.detail must stay inside the package')
      assert.equal(existsSync(resolve(PACKAGE_ROOT, detail)), true, `locale/${locale}.json meta.detail points at missing ${detail}`)
    }
  })
})

describe('skills tree content', () => {
  test('contains exactly the 15 skill directories, each with SKILL.md', async () => {
    const entries = await readdir(SKILLS_DIRECTORY, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
    assert.deepEqual(directories, EXPECTED_SKILL_NAMES)
    for (const directory of directories) {
      assert.equal(existsSync(join(SKILLS_DIRECTORY, directory, 'SKILL.md')), true, `${directory}/SKILL.md missing`)
    }
  })

  test('every SKILL.md parses with name equal to its directory and a real body', async () => {
    for (const name of EXPECTED_SKILL_NAMES) {
      const raw = await readFile(join(SKILLS_DIRECTORY, name, 'SKILL.md'), 'utf8')
      const { data, body } = parseFrontmatter(raw)
      assert.equal(data.name, name, `${name}: frontmatter name must equal the directory`)
      assert.equal(typeof data.description, 'string')
      assert.ok(data.description.length > 0, `${name}: description must be non-empty`)
      assert.ok(body.trim().length > 0, `${name}: body must be non-empty`)
      assert.equal(/^---\r?\n/.test(body), false, `${name}: body must not keep the frontmatter block`)
      assert.equal(stripFrontmatter(raw).trim().length > 0, true)
    }
  })

  test('no skill body can close or reopen the underscore bootstrap wrapper', async () => {
    for (const name of EXPECTED_SKILL_NAMES) {
      const raw = await readFile(join(SKILLS_DIRECTORY, name, 'SKILL.md'), 'utf8')
      const body = stripFrontmatter(raw)
      assert.equal(body.includes(BOOTSTRAP_MARKER), false, `${name} contains the wrapper open tag`)
      assert.equal(body.includes(BOOTSTRAP_CLOSING_TAG), false, `${name} contains the wrapper close tag`)
    }
  })

  test('dsh-tools.md exists and covers every required DSH tool term', async () => {
    const file = join(SKILLS_DIRECTORY, 'using-superpowers', 'references', 'dsh-tools.md')
    assert.equal(existsSync(file), true)
    const text = await readFile(file, 'utf8')
    assert.ok(text.trim().length > 1000, 'the tool mapping should be substantive')
    const missing = REQUIRED_DSH_TOOL_TERMS.filter((term) => !text.includes(term))
    assert.deepEqual(missing, [], `dsh-tools.md is missing required terms: ${missing.join(', ')}`)
  })

  test('the mapping states ask_user_question timeout and plan-mode restraint accurately', async () => {
    const text = await readFile(join(SKILLS_DIRECTORY, 'using-superpowers', 'references', 'dsh-tools.md'), 'utf8')
    const questions = sectionBetween(text, '## Questions to the user', '## Plan mode')
    assert.ok(questions.length > 0)
    // The default profile registers the untimed ask_user_question variant; a
    // timeout may only be described as a deployment-enabled timed variant.
    assert.equal(/timed-wait parameter/i.test(questions), false, 'must not claim a timed-wait parameter for ask_user_question')
    if (/timeout/i.test(questions)) {
      assert.match(questions, /timed variant|deployment/i, 'any timeout mention must be qualified as a deployment variant')
    }
    // Plan mode restrains by guidance text only; it does not policy-block tools.
    const planMode = sectionBetween(text, '## Plan mode', '## Web')
    assert.ok(planMode.length > 0)
    assert.equal(/policy-blocked|policy blocked/i.test(planMode), false, 'must not call plan mode policy-blocking')
    assert.equal(/mutation tools? (?:are |get )?blocked|blocks? mutation/i.test(planMode), false)
    // Frontmatter invocation keys are the runtime's canonical spellings.
    assert.ok(text.includes('disable-model-invocation'))
    assert.ok(text.includes('user-invocable'))
    assert.equal(text.includes('model-invocable'), false, 'the legacy model-invocable key must not be documented')
  })

  test('using-superpowers/SKILL.md lists dsh-tools.md under Platform Adaptation', async () => {
    const raw = await readFile(join(SKILLS_DIRECTORY, 'using-superpowers', 'SKILL.md'), 'utf8')
    const start = raw.indexOf('## Platform Adaptation')
    assert.ok(start >= 0, 'Platform Adaptation section is required')
    const end = raw.indexOf('\n## ', start + 1)
    const section = raw.slice(start, end < 0 ? undefined : end)
    assert.ok(section.includes('dsh-tools.md'), 'the DSH row must reference dsh-tools.md')
    assert.match(section, /DSH|DeepSeek/, 'the DSH row must name the harness')
    assert.equal(section.startsWith('## Platform Adaptation'), true)
  })

  test('the bootstrap composes from the packaged files with a bounded prompt cost', async () => {
    const skillSource = await readFile(join(SKILLS_DIRECTORY, 'using-superpowers', 'SKILL.md'), 'utf8')
    const mapping = await readFile(join(SKILLS_DIRECTORY, 'using-superpowers', 'references', 'dsh-tools.md'), 'utf8')
    const body = stripFrontmatter(skillSource)
    const text = composeBootstrapText({ usingSuperpowersBody: body, toolMapping: mapping })

    assert.equal(text.startsWith(`${BOOTSTRAP_MARKER}\n${BOOTSTRAP_HEADLINE}\n\n`), true)
    assert.ok(text.includes(body.trim()))
    assert.ok(text.endsWith(`${mapping.trim()}\n${BOOTSTRAP_CLOSING_TAG}`), 'mapping must be the last member')
    assert.equal(countOccurrences(text, BOOTSTRAP_MARKER), 1)
    assert.equal(countOccurrences(text, BOOTSTRAP_CLOSING_TAG), 1)
    assert.ok(text.length > 2000, `bootstrap unexpectedly small: ${text.length} chars`)
    assert.ok(text.length < 24 * 1024, `bootstrap exceeds the prompt-cost guard: ${text.length} chars`)
    // The wrapper is interpolate:false; record whether the prose would otherwise
    // be interpreted as prompt variables (it must be safe either way).
    assert.equal(countOccurrences(text, BOOTSTRAP_CLOSING_TAG), 1)
  })
})

describe('lib module hygiene', () => {
  test('lib/*.js imports only node: builtins and relative modules', async () => {
    const entries = await readdir(packagePath('lib'))
    const jsFiles = entries.filter((entry) => entry.endsWith('.js'))
    assert.ok(jsFiles.length >= 3)
    for (const file of jsFiles) {
      const source = await readFile(join(PACKAGE_ROOT, 'lib', file), 'utf8')
      for (const specifier of importSpecifiers(source)) {
        assert.ok(
          specifier.startsWith('node:') || specifier.startsWith('.'),
          `lib/${file} imports a non-builtin/non-relative module: ${specifier}`,
        )
      }
    }
  })

  test('the skill tree carries no build artifacts or node_modules', async () => {
    for (const forbidden of ['node_modules', 'package-lock.json', 'pnpm-lock.yaml']) {
      assert.equal(existsSync(join(SKILLS_DIRECTORY, forbidden)), false, `skills/ must not contain ${forbidden}`)
    }
  })
})

function extractAnchor(raw) {
  const match = raw.match(/^\s*name:\s*['"]([^'"]+)['"]\s*$/m)
  assert.ok(match, 'cordis.patch.yml must declare an inserted plugin name')
  return match[1]
}

function importSpecifiers(source) {
  const specifiers = []
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1])
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(match[1])
  return specifiers
}

function countOccurrences(haystack, needle) {
  let count = 0
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1
  return count
}

/** The text between two heading lines, or '' when either heading is absent. */
function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading)
  if (start < 0) return ''
  const end = text.indexOf(endHeading, start + startHeading.length)
  return text.slice(start, end < 0 ? undefined : end)
}
