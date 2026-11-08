/**
 * Upstream parity test.
 *
 * Contract source: docs/DESIGN.md — the packaged `skills/` tree is copied
 * verbatim from obra/superpowers v7.0.2 except for exactly two sanctioned
 * deviations: the new `references/dsh-tools.md` and one added line in
 * `using-superpowers/SKILL.md`.
 *
 * Skips when the reference checkout is not present (set SUPERPOWERS_REF_ROOT).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, test } from 'node:test'

import { DEFAULT_REFERENCE_ROOT, REFERENCE_COMMIT, SKILLS_DIRECTORY } from './support/fixtures.mjs'

const referenceRoot = resolve(process.env.SUPERPOWERS_REF_ROOT ?? DEFAULT_REFERENCE_ROOT)
const referenceSkills = join(referenceRoot, 'skills')
const referenceAvailable = existsSync(join(referenceSkills, 'using-superpowers', 'SKILL.md'))
const SANCTIONED_NEW_FILE = 'using-superpowers/references/dsh-tools.md'

describe(
  'upstream parity vs obra/superpowers',
  {
    skip: referenceAvailable
      ? false
      : `reference checkout not found at ${referenceSkills}; set SUPERPOWERS_REF_ROOT to a obra/superpowers checkout`,
  },
  () => {
    test('reference checkout is pinned at the v7.0.2 commit and clean', (t) => {
      let head
      try {
        head = git(['rev-parse', 'HEAD'])
      } catch {
        t.skip('git is unavailable; cannot verify the reference commit')
        return
      }
      assert.equal(head, REFERENCE_COMMIT, 'reference checkout must stay on the pinned commit')
      const dirty = git(['status', '--porcelain', '--', 'skills'])
      assert.equal(dirty, '', 'the reference skills tree must not be modified')
    })

    test('the packaged tree adds exactly one file and removes none', () => {
      const referenceFiles = listFiles(referenceSkills)
      const packagedFiles = listFiles(SKILLS_DIRECTORY)
      const referenceSet = new Set(referenceFiles)
      const packagedSet = new Set(packagedFiles)
      const added = packagedFiles.filter((file) => !referenceSet.has(file))
      const removed = referenceFiles.filter((file) => !packagedSet.has(file))
      assert.deepEqual(added, [SANCTIONED_NEW_FILE], 'only dsh-tools.md may be added')
      assert.deepEqual(removed, [], 'upstream files must not be removed or renamed')
      assert.equal(referenceFiles.length, 80, 'v7.0.2 ships 80 files across 15 skill directories')
      assert.equal(packagedFiles.length, 81)
    })

    test('every shared skill file is byte-identical except using-superpowers/SKILL.md', () => {
      for (const file of listFiles(referenceSkills)) {
        if (file === 'using-superpowers/SKILL.md') continue
        const reference = readFileSync(join(referenceSkills, file))
        const packaged = readFileSync(join(SKILLS_DIRECTORY, file))
        assert.equal(packaged.equals(reference), true, `${file} differs from upstream v7.0.2`)
      }
    })

    test('using-superpowers/SKILL.md differs by exactly one added line', () => {
      const referenceLines = readLines(join(referenceSkills, 'using-superpowers', 'SKILL.md'))
      const packagedLines = readLines(join(SKILLS_DIRECTORY, 'using-superpowers', 'SKILL.md'))
      assert.equal(packagedLines.length, referenceLines.length + 1, 'exactly one line may be added')
      assert.notDeepEqual(packagedLines, referenceLines)

      let insertedAt = 0
      while (insertedAt < referenceLines.length && packagedLines[insertedAt] === referenceLines[insertedAt]) insertedAt += 1
      assert.deepEqual(
        packagedLines.slice(insertedAt + 1),
        referenceLines.slice(insertedAt),
        'the packaged file must equal upstream plus one inserted line',
      )
      const inserted = packagedLines[insertedAt]
      assert.ok(inserted.includes('dsh-tools.md'), `the inserted line must reference dsh-tools.md: ${inserted}`)

      const platformStart = referenceLines.indexOf('## Platform Adaptation')
      assert.ok(platformStart >= 0, 'upstream keeps a Platform Adaptation section')
      const nextHeading = referenceLines.findIndex((line, index) => index > platformStart && line.startsWith('## '))
      const platformEnd = nextHeading < 0 ? referenceLines.length : nextHeading
      assert.ok(
        insertedAt > platformStart && insertedAt < platformEnd + 1,
        'the inserted line belongs in the Platform Adaptation list',
      )
    })
  },
)

function git(args) {
  return execFileSync('git', ['-C', referenceRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function readLines(file) {
  return readFileSync(file, 'utf8').split('\n')
}

function listFiles(root, prefix = '') {
  const files = []
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) files.push(...listFiles(root, relative))
    else if (entry.isFile()) files.push(relative)
  }
  return files.sort()
}
