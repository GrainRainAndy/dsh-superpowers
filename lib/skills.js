/**
 * Skill discovery for the bundled Superpowers tree.
 *
 * The package ships the upstream `skills/` tree verbatim; this module turns it
 * into skill-registry candidates and lazily loads a skill body on demand. It
 * depends on node builtins only, so the bundle has no install-time dependencies.
 *
 * @module dsh-superpowers/skills
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the packaged `skills/` tree. */
export const SKILLS_DIRECTORY = fileURLToPath(new URL('../skills/', import.meta.url))

/** Provider name reported in catalogs and loaded definitions. */
export const PROVIDER_NAME = 'superpowers'

/** Source label for skills that ship inside a plugin package. */
export const SKILL_SOURCE = 'bundled'

/**
 * Standard precedence rank for packaged skill providers, matching
 * `BUNDLED_SKILL_RANK` from `@deepseek-ai/dsh-skill` (600). Project and user
 * skill roots rank lower and therefore override a same-named bundled skill.
 */
export const SKILL_RANK = 600

/** Valid skill names are bare kebab-case identifiers (the registry grammar). */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Frontmatter delimiter at the start of a skill file. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/

/**
 * Parse the leading YAML frontmatter block of a skill file.
 *
 * Supports the shape upstream skills use: `key: value` lines, one matching
 * pair of surrounding quotes, and indented continuation lines folded into the
 * previous key. A missing or unterminated block yields `{ data: {}, body }`.
 *
 * @param text - raw file content.
 * @returns Parsed frontmatter fields and the body with the block removed.
 */
export function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text)
  if (match === null) return { data: {}, body: text }
  const [, raw, body] = match
  const data = {}
  let lastKey = null
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.trim().length === 0) {
      lastKey = null
      continue
    }
    const colon = line.indexOf(':')
    if (colon > 0 && !/^\s/.test(line)) {
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      data[key] = value
      lastKey = /^[>|][+-]?$/.test(value) ? null : key
      if (lastKey === null) data[key] = ''
      continue
    }
    if (lastKey !== null) data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim()
  }
  for (const key of Object.keys(data)) data[key] = unquote(data[key])
  return { data, body }
}

/**
 * Remove the leading frontmatter block from a skill file.
 *
 * @param text - raw file content.
 * @returns the skill body.
 */
export function stripFrontmatter(text) {
  return parseFrontmatter(text).body
}

/** Remove exactly one matching surrounding quote pair, leaving unbalanced quotes alone. */
function unquote(value) {
  return value.replace(/^(["'])([\s\S]*)\1$/, '$2')
}

/**
 * Discover every skill in a tree and build registry candidates.
 *
 * Every directory child must hold a `SKILL.md` whose frontmatter declares a
 * kebab-case `name` matching the directory and a non-empty `description`. A
 * violation throws instead of silently dropping a skill: packaged content is
 * validated in the test suite, so a load-time failure means the package itself
 * is broken and must be reported loudly.
 *
 * @param options.directory - skill tree to scan; defaults to the packaged tree.
 * @returns candidates sorted by skill name.
 */
export async function listSkillCandidates({ directory = SKILLS_DIRECTORY } = {}) {
  const entries = await readdir(directory, { withFileTypes: true })
  const skillDirectories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
  const seen = new Map()
  const candidates = []
  for (const skillDirectory of skillDirectories) {
    const skillRoot = join(directory, skillDirectory)
    const skillFile = join(skillRoot, 'SKILL.md')
    const parsed = parseFrontmatter(await readFile(skillFile, 'utf8'))
    const name = parsed.data.name
    const description = parsed.data.description
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
      throw new Error(`superpowers: skill "${skillDirectory}" has an invalid frontmatter name ${JSON.stringify(name)}`)
    }
    if (name !== skillDirectory) {
      throw new Error(`superpowers: skill "${skillDirectory}" declares frontmatter name "${name}"; the name must match the directory`)
    }
    if (typeof description !== 'string' || description.length === 0) {
      throw new Error(`superpowers: skill "${name}" has no frontmatter description`)
    }
    if (seen.has(name)) throw new Error(`superpowers: duplicate skill name "${name}" in ${seen.get(name)} and ${skillDirectory}`)
    seen.set(name, skillDirectory)
    candidates.push({
      name,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: PROVIDER_NAME,
      source: SKILL_SOURCE,
      resourceBase: { kind: 'directory', path: skillRoot },
      rank: SKILL_RANK,
      locator: skillFile,
      path: skillFile,
    })
  }
  return candidates.sort((left, right) => compareCodePoints(left.name, right.name))
}

/** Compare two strings by code point so catalog order is machine-independent. */
function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Load one skill body. The file is re-read on every load, matching the
 * filesystem provider's behavior; discovery metadata stays cached by the
 * provider.
 *
 * @param candidate - discovery candidate carrying the skill file path.
 * @returns the skill body without frontmatter.
 */
export async function loadSkillBody(candidate) {
  return stripFrontmatter(await readFile(candidate.locator, 'utf8'))
}

/**
 * Build a skill provider for `ctx.skills.registerProvider`.
 *
 * Discovery runs once per provider instance and is retried after a failure, so
 * a transient read error does not pin an empty catalog.
 *
 * @param options.directory - skill tree to scan; defaults to the packaged tree.
 * @returns provider with `name`, `list`, and `get`.
 */
export function createSkillProvider({ directory = SKILLS_DIRECTORY } = {}) {
  let candidates
  return {
    name: PROVIDER_NAME,
    list() {
      candidates ??= listSkillCandidates({ directory }).catch((error) => {
        candidates = undefined
        throw error
      })
      return candidates
    },
    async get(candidate) {
      const content = await loadSkillBody(candidate)
      return {
        name: candidate.name,
        description: candidate.description,
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        resourceBase: candidate.resourceBase,
        path: candidate.path,
        content,
      }
    },
  }
}
