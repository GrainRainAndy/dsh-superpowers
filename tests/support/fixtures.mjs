/**
 * Shared constants and runtime discovery for the dsh-superpowers test suite.
 *
 * This module is not a test file: it is imported by the `*.test.mjs` suites
 * under `tests/`. It has no external dependencies and reads no package state
 * beyond what the suites pass in.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Absolute package root (`dsh-superpowers/`), with a trailing separator. */
export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Absolute path of the packaged skill tree. */
export const SKILLS_DIRECTORY = join(PACKAGE_ROOT, 'skills')

/** The complete v7.0.2 upstream skill set, sorted by code point. */
export const EXPECTED_SKILL_NAMES = Object.freeze([
  'brainstorming',
  'diagnosing-superpowers',
  'dispatching-parallel-agents',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
])

/** Skill directories whose `resourceBase` must point at files they reference. */
export const SKILLS_WITH_RESOURCES = Object.freeze({
  brainstorming: ['scripts/frame-template.html', 'scripts/server.cjs', 'visual-companion.md'],
  'executing-plans': ['scripts/task-done', 'scripts/task-start'],
  'requesting-code-review': ['code-reviewer.md'],
  'subagent-driven-development': ['implementer-prompt.md', 'references/fix-loop.md', 'scripts/sdd-repo'],
  'systematic-debugging': ['root-cause-tracing.md', 'find-polluter.sh'],
  'using-superpowers': ['references/dsh-tools.md', 'references/claude-code-tools.md'],
  'writing-skills': ['references/bulletproofing.md', 'render-graphs.js'],
})

/** Locales the Plugin Manager inventory reads (English is the fallback source). */
export const REQUIRED_LOCALES = Object.freeze(['en', 'zh'])

/** Exact DSH tool names/terms the DSH tool mapping must cover (DESIGN.md). */
export const REQUIRED_DSH_TOOL_TERMS = Object.freeze([
  // 1. Skill invocation
  'skill',
  '/name',
  'superpowers:',
  // 2. Subagents
  'subagent',
  'subagent_fork',
  'send_message',
  'list_agents',
  'wait_agent',
  // 3. Task tracking
  'todo_write',
  'pending',
  'in_progress',
  'completed',
  // 4. Model selection on dispatch
  'provider',
  'model',
  'reasoning_effort',
  // 5. File and shell tools
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'bash',
  'workdir',
  'run_in_background',
  'job_output',
  'working_directory',
  // 6. User questions
  'ask_user_question',
  // 7. Plan mode
  'exit_plan_mode',
  '/plan',
  // 8. Web
  'web_search',
  'web_fetch',
  // 9. Skill authoring locations
  '$DSH_HOME/skills',
  '.dsh/skills',
  '.agents/skills',
  'SKILL.md',
  'frontmatter',
  // 10. Session transcripts
  '$DSH_HOME/sessions',
  '.jsonl.zstd',
  'zstd -dc',
  // 11. Instruction precedence
  'AGENTS.md',
])

/** Default extracted DSH runtime root used during development. */
export const DEFAULT_RUNTIME_ROOT = '/Users/grainrain/Developer/AgentHome/.ref/dsh-asar/dsh'

/** Default reference checkout of obra/superpowers: env override, else a sibling checkout. */
export const DEFAULT_REFERENCE_ROOT = process.env.SUPERPOWERS_REF_ROOT ?? resolve(PACKAGE_ROOT, '..', 'superpowers-ref')

/** Upstream commit the packaged tree must match (v7.0.2). */
export const REFERENCE_COMMIT = '22f0b463e7a5e579904dd6211a520321035526f7'

/**
 * Locate the extracted DSH runtime's `@deepseek-ai` package directory.
 *
 * Accepts either the dsh package root (`.../dsh`, containing `node_modules`)
 * or the `@deepseek-ai` directory itself, so `DSH_RUNTIME_ROOT` works for
 * either convention a future machine uses.
 *
 * @returns `{ available, root, modules, entryPoints }`; `available` is false
 *   when any of cordis, dsh-skill, or dsh-system-prompt is missing.
 */
export function resolveRuntime() {
  const configured = process.env.DSH_RUNTIME_ROOT
  const root = resolve(configured ?? DEFAULT_RUNTIME_ROOT)
  const candidates = [
    join(root, 'node_modules', '@deepseek-ai'),
    join(root, '@deepseek-ai'),
    root,
  ]
  const attempted = []
  for (const modules of candidates) {
    const entryPoints = {
      cordis: join(modules, 'cordis', 'lib', 'index.js'),
      skill: join(modules, 'dsh-skill', 'lib', 'index.js'),
      systemPrompt: join(modules, 'dsh-system-prompt', 'lib', 'index.js'),
      appBoot: join(modules, 'dsh-app-boot', 'lib', 'index.js'),
      skillFilesystem: join(modules, 'dsh-skill-filesystem', 'lib', 'index.js'),
    }
    attempted.push(modules)
    const has = Object.fromEntries(Object.entries(entryPoints).map(([name, file]) => [name, existsSync(file)]))
    // The testing contract requires cordis, dsh-skill, and dsh-system-prompt.
    if (has.cordis && has.skill && has.systemPrompt) {
      return {
        available: true,
        root,
        modules,
        entryPoints,
        has,
        urls: Object.fromEntries(
          Object.entries(entryPoints).map(([name, file]) => [name, pathToFileURL(file).href]),
        ),
      }
    }
  }
  return { available: false, root, attempted }
}

/** Error message used to skip the Cordis integration suite. */
export function runtimeSkipMessage(runtime) {
  return [
    `DSH runtime not found under ${runtime.root} (tried ${runtime.attempted.join(', ')}).`,
    'Expected cordis/lib/index.js, dsh-skill/lib/index.js and dsh-system-prompt/lib/index.js.',
    'Set DSH_RUNTIME_ROOT to an extracted dsh package root (or its @deepseek-ai directory).',
  ].join(' ')
}

/** Absolute path of a packaged file. */
export function packagePath(...segments) {
  return join(PACKAGE_ROOT, ...segments)
}

/** Read and parse a JSON file synchronously. */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}
