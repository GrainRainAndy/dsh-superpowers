/**
 * Bootstrap composition for the Superpowers system-prompt section.
 *
 * Porting contract (see `docs/DESIGN.md`): upstream skill bodies are shipped
 * verbatim and name actions, not harness tools. The bootstrap injects the
 * `using-superpowers` skill body once at session start, followed by the DSH
 * tool mapping that translates those actions into real tool names.
 *
 * @module dsh-superpowers/prompt
 */
/** Prompt-section name registered on `ctx.systemPrompt`. */
export const SUPERPOWERS_SECTION_NAME = 'superpowers:bootstrap'

/**
 * Section order. First-party process and tool guidance sits at or below 5000;
 * deliverable, structured-output, and harness sections sit at 9000 and above.
 */
export const SUPERPOWERS_SECTION_ORDER = 6000

/** Opening tag of the injected block; tests use it as the bootstrap marker. */
export const BOOTSTRAP_MARKER = '<EXTREMELY_IMPORTANT>'

/** First line after the marker. */
export const BOOTSTRAP_HEADLINE = 'You have superpowers.'

/** Closing tag of the injected block. */
export const BOOTSTRAP_CLOSING_TAG = '</EXTREMELY_IMPORTANT>'

/** The already-loaded note keeps the model from reloading the bootstrap skill. */
export const BOOTSTRAP_ALREADY_LOADED =
  '**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED — you are currently following it. Do NOT use the skill tool to load "using-superpowers" again — that would be redundant.**'

/**
 * Compose the complete bootstrap text.
 *
 * @param sources.usingSuperpowersBody - `skills/using-superpowers/SKILL.md`
 *   with frontmatter removed.
 * @param sources.toolMapping - `skills/using-superpowers/references/dsh-tools.md`.
 * @returns the tagged bootstrap block injected into the system prompt.
 * @throws when either source is empty, because a bootstrap without its skill
 *   body or without the tool mapping is inert or misleading.
 */
export function composeBootstrapText({ usingSuperpowersBody, toolMapping }) {
  const body = requireSource('using-superpowers skill body', usingSuperpowersBody)
  const mapping = requireSource('DSH tool mapping', toolMapping)
  return [
    BOOTSTRAP_MARKER,
    BOOTSTRAP_HEADLINE,
    '',
    BOOTSTRAP_ALREADY_LOADED,
    '',
    body,
    '',
    mapping,
    BOOTSTRAP_CLOSING_TAG,
  ].join('\n')
}

/** Normalize a source file's content and reject an empty one. */
function requireSource(label, value) {
  if (typeof value !== 'string') throw new TypeError(`superpowers: missing ${label}`)
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`superpowers: missing ${label}`)
  return trimmed
}

/**
 * Whether an assembled prompt belongs to a delegated (subagent) session.
 *
 * Superpowers subagent workflows assume freshly dispatched workers do not
 * re-enter the design and approval cycle, so the bootstrap is injected only for
 * top-level sessions. Skills stay registered for every session, so a worker can
 * still load one explicitly when its dispatch prompt says to.
 *
 * Delegation is detected the same way `@deepseek-ai/dsh-subagent` resolves it:
 * the durable session header's `delegationDepth`, plus the live
 * `AgentOptions.subagentDepth` stamp that covers a child before its first
 * request is assembled.
 *
 * @param agent - the assembly context's agent, when present.
 * @returns true for a delegated agent at any depth greater than zero.
 */
export function isDelegatedAgent(agent) {
  const headerDepth = agent?.session?.header?.delegationDepth
  const runtimeDepth = agent?.options?.subagentDepth
  return (typeof headerDepth === 'number' && headerDepth > 0) || (typeof runtimeDepth === 'number' && runtimeDepth > 0)
}

/**
 * Build the section text provider.
 *
 * An empty string removes the section at render time; the registration itself
 * stays in place for the whole plugin lifetime.
 *
 * @param bootstrapText - composed bootstrap block.
 * @returns a function mapping assembly context to section text.
 */
export function createBootstrapSectionText(bootstrapText) {
  return (context) => (isDelegatedAgent(context?.agent) ? '' : bootstrapText)
}
