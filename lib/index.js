/**
 * dsh-superpowers Host plugin.
 *
 * Registers the packaged Superpowers skills on `ctx.skills` and injects the
 * `using-superpowers` bootstrap (plus the DSH tool mapping) into the system
 * prompt of every top-level session. See `docs/DESIGN.md` for the contract and
 * `../../rules` (none) for the upstream porting rules this follows.
 *
 * @module dsh-superpowers
 */
import { readFile } from 'node:fs/promises'
import { createSkillProvider } from './skills.js'
import { composeBootstrapText, createBootstrapSectionText, SUPERPOWERS_SECTION_NAME, SUPERPOWERS_SECTION_ORDER } from './prompt.js'
import { stripFrontmatter } from './skills.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'superpowers'

/** Services the plugin contributes to. */
export const inject = ['skills', 'systemPrompt']

/** The bootstrap skill shipped in this package. */
const BOOTSTRAP_SKILL_URL = new URL('../skills/using-superpowers/SKILL.md', import.meta.url)

/** The DSH tool mapping appended to the bootstrap. */
const TOOL_MAPPING_URL = new URL('../skills/using-superpowers/references/dsh-tools.md', import.meta.url)

/**
 * Register the skill provider and the bootstrap prompt section.
 *
 * @param ctx - plugin context with `skills` and `systemPrompt` services.
 * @returns a disposer removing both registrations.
 */
export async function apply(ctx) {
  const [skillSource, toolMapping] = await Promise.all([readFile(BOOTSTRAP_SKILL_URL, 'utf8'), readFile(TOOL_MAPPING_URL, 'utf8')])
  const bootstrapText = composeBootstrapText({
    usingSuperpowersBody: stripFrontmatter(skillSource),
    toolMapping,
  })
  const disposeProvider = ctx.skills.registerProvider(() => createSkillProvider())
  const disposeSection = ctx.systemPrompt.section({
    name: SUPERPOWERS_SECTION_NAME,
    order: SUPERPOWERS_SECTION_ORDER,
    interpolate: false,
    text: createBootstrapSectionText(bootstrapText),
  })
  return () => {
    disposeSection()
    disposeProvider()
  }
}
