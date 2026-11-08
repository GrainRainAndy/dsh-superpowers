/**
 * Unit tests for `lib/prompt.js`.
 *
 * Contract source: docs/DESIGN.md "Bootstrap composition". The composed text
 * is the only part of the ~600 KiB skill tree that enters a session prompt, so
 * its shape, tag balance, and injection safety are checked here directly.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  BOOTSTRAP_ALREADY_LOADED,
  BOOTSTRAP_CLOSING_TAG,
  BOOTSTRAP_HEADLINE,
  BOOTSTRAP_MARKER,
  SUPERPOWERS_SECTION_NAME,
  SUPERPOWERS_SECTION_ORDER,
  composeBootstrapText,
  createBootstrapSectionText,
  isDelegatedAgent,
} from '../lib/prompt.js'

const BODY = '## The Rule\n\nInvoke relevant skills before responding.\n'
const MAPPING = '# DSH tool mapping\n\n- Use the `skill` tool with bare names.\n'

describe('section constants', () => {
  test('match the design contract', () => {
    assert.equal(SUPERPOWERS_SECTION_NAME, 'superpowers:bootstrap')
    assert.equal(SUPERPOWERS_SECTION_ORDER, 6000)
    assert.equal(BOOTSTRAP_MARKER, '<EXTREMELY_IMPORTANT>')
    assert.equal(BOOTSTRAP_HEADLINE, 'You have superpowers.')
    assert.equal(BOOTSTRAP_CLOSING_TAG, '</EXTREMELY_IMPORTANT>')
    assert.ok(BOOTSTRAP_ALREADY_LOADED.includes('using-superpowers'))
    assert.ok(BOOTSTRAP_ALREADY_LOADED.includes('Do NOT use the skill tool'))
  })

  test('the wrapping marker differs from the upstream hyphenated tag', () => {
    // Upstream using-superpowers bodies contain <EXTREMELY-IMPORTANT> (hyphen).
    // The wrapper uses an underscore so the two never close each other.
    assert.notEqual(BOOTSTRAP_MARKER, '<EXTREMELY-IMPORTANT>')
  })
})

describe('composeBootstrapText', () => {
  test('produces the blank-line separated tagged block', () => {
    const text = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
    const lines = text.split('\n')
    assert.equal(lines[0], BOOTSTRAP_MARKER)
    assert.equal(lines[1], BOOTSTRAP_HEADLINE)
    assert.equal(lines[2], '')
    assert.equal(lines[3], BOOTSTRAP_ALREADY_LOADED)
    assert.equal(lines[4], '')
    assert.equal(text.trimEnd().endsWith(BOOTSTRAP_CLOSING_TAG), true)
    assert.equal(text.endsWith(BOOTSTRAP_CLOSING_TAG), true, 'closing tag must be the last bytes')
  })

  test('places the skill body before the tool mapping, and the mapping last', () => {
    const text = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
    const bodyAt = text.indexOf(BODY)
    const mappingAt = text.indexOf(MAPPING)
    assert.ok(bodyAt > 0, 'skill body must be present')
    assert.ok(mappingAt > bodyAt, 'mapping must follow the skill body')
    assert.equal(text.indexOf(BOOTSTRAP_CLOSING_TAG), mappingAt + MAPPING.trim().length + 1)
    assert.equal(text.slice(0, bodyAt).includes(BOOTSTRAP_ALREADY_LOADED), true)
  })

  test('wraps exactly one underscore tag pair', () => {
    const text = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
    assert.equal(countOccurrences(text, BOOTSTRAP_MARKER), 1)
    assert.equal(countOccurrences(text, BOOTSTRAP_CLOSING_TAG), 1)
  })

  test('trims surrounding whitespace from both sources', () => {
    const padded = composeBootstrapText({
      usingSuperpowersBody: `\n\n  ${BODY}  \n\n`,
      toolMapping: `\n${MAPPING}\n\n`,
    })
    const clean = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
    assert.equal(padded, clean)
  })

  test('is deterministic', () => {
    assert.equal(
      composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING }),
      composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING }),
    )
  })

  test('rejects an empty or whitespace-only skill body', () => {
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: '', toolMapping: MAPPING }), /using-superpowers/)
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: '   \n', toolMapping: MAPPING }), /using-superpowers/)
    assert.throws(() => composeBootstrapText({ toolMapping: MAPPING }), /using-superpowers/)
  })

  test('rejects an empty or whitespace-only tool mapping', () => {
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: '' }), /tool mapping/)
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: '\n\n' }), /tool mapping/)
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: BODY }), /tool mapping/)
  })

  test('rejects non-string sources', () => {
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: 42, toolMapping: MAPPING }), TypeError)
    assert.throws(() => composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: null }), TypeError)
  })

  test('member order in the composed text follows the DESIGN block', () => {
    const text = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
    const order = [BOOTSTRAP_MARKER, BOOTSTRAP_HEADLINE, BOOTSTRAP_ALREADY_LOADED, BODY, MAPPING, BOOTSTRAP_CLOSING_TAG]
    let cursor = -1
    for (const member of order) {
      const at = text.indexOf(member)
      assert.ok(at > cursor, `"${member.slice(0, 24)}…" is out of order`)
      cursor = at
    }
  })
})

describe('isDelegatedAgent', () => {
  test('treats delegationDepth 0 as a top-level session', () => {
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: 0 } } }), false)
  })

  test('treats positive delegation depth as delegated', () => {
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: 1 } } }), true)
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: 3 } } }), true)
  })

  test('honors the live AgentOptions.subagentDepth signal', () => {
    // DESIGN: delegated when header delegationDepth > 0 OR options.subagentDepth > 0
    // (the same signals @deepseek-ai/dsh-subagent's delegationDepthOf uses).
    assert.equal(isDelegatedAgent({ options: { subagentDepth: 1 } }), true)
    assert.equal(isDelegatedAgent({ session: { header: {} }, options: { subagentDepth: 2 } }), true)
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: 0 } }, options: { subagentDepth: 1 } }), true)
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: 3 } }, options: { subagentDepth: 0 } }), true)
    assert.equal(isDelegatedAgent({ options: { subagentDepth: 0 } }), false)
    assert.equal(isDelegatedAgent({ options: {} }), false)
    assert.equal(isDelegatedAgent({ options: { subagentDepth: '1' } }), false)
  })

  test('treats negative or non-finite depth as top-level', () => {
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: -1 } } }), false)
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: Number.NaN } } }), false)
  })

  test('treats every missing field as a top-level session', () => {
    assert.equal(isDelegatedAgent(undefined), false)
    assert.equal(isDelegatedAgent(null), false)
    assert.equal(isDelegatedAgent({}), false)
    assert.equal(isDelegatedAgent({ session: {} }), false)
    assert.equal(isDelegatedAgent({ session: { header: {} } }), false)
    assert.equal(isDelegatedAgent({ options: {} }), false)
  })

  test('ignores non-numeric delegationDepth values', () => {
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: '1' } } }), false)
    assert.equal(isDelegatedAgent({ session: { header: { delegationDepth: true } } }), false)
  })
})

describe('createBootstrapSectionText', () => {
  const text = composeBootstrapText({ usingSuperpowersBody: BODY, toolMapping: MAPPING })
  const sectionText = createBootstrapSectionText(text)

  test('returns the composed bootstrap for a top-level assembly context', () => {
    assert.equal(sectionText({ agent: { session: { header: { delegationDepth: 0 } } } }), text)
    assert.equal(sectionText({}), text)
    assert.equal(sectionText(undefined), text)
    assert.equal(sectionText(null), text)
  })

  test('returns the empty string (so the renderer drops it) for delegated sessions', () => {
    assert.equal(sectionText({ agent: { session: { header: { delegationDepth: 1 } } } }), '')
    assert.equal(sectionText({ agent: { session: { header: { delegationDepth: 2 } } } }), '')
    assert.equal(sectionText({ agent: { options: { subagentDepth: 1 } } }), '')
  })

  test('produces the same text for repeated calls', () => {
    assert.equal(sectionText({}), sectionText({ agent: { session: { header: { delegationDepth: 0 } } } }))
  })
})

function countOccurrences(haystack, needle) {
  let count = 0
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1
  return count
}
