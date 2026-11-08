# dsh-superpowers design

Status: implementation contract for the DSH port of [obra/superpowers](https://github.com/obra/superpowers).

## Goal

Ship the Superpowers skills and its session bootstrap as a DSH profile bundle:

1. Every packaged Superpowers skill appears in the session skill catalog and can be loaded with the `skill` tool.
2. Every top-level session's system prompt carries the `using-superpowers` bootstrap plus a DSH tool mapping, with no per-session opt-in. Subagent sessions (delegation depth > 0) do not receive it, matching the fresh-context model Superpowers' subagent skills assume.
3. Installed through the Harness's own mechanism: `plugin_manager` `install_bundle` with this package directory.

Reference upstream: `github.com/obra/superpowers` at commit `22f0b463e7a5e579904dd6211a520321035526f7` (v7.0.2). Upstream skills are copied verbatim except for adding the DSH row to `skills/using-superpowers/SKILL.md`'s Platform Adaptation list; the DSH tool mapping lives in a new file `skills/using-superpowers/references/dsh-tools.md`.

## Package layout

```
dsh-superpowers/
  package.json          bundle + plugin manifest (dsh.bundle.patch, exports, icon, files)
  cordis.patch.yml      inserts the "superpowers" row; name anchored beside the patch
  icon.svg              original 36x36 SVG icon
  locale/{en,zh}.json   meta.title / meta.description for Plugin Manager
  lib/
    index.js            Cordis plugin: provider registration + bootstrap prompt section
    skills.js           skill tree discovery, frontmatter parsing, body loading
    prompt.js           bootstrap composition, section constants, delegation detection
  skills/               upstream skills tree (verbatim; dsh-tools.md added)
  tests/                node:test suites (unit + Cordis integration)
  docs/                 DESIGN.md (this file), DETAIL.md, DETAIL.zh.md, VERIFICATION.md
  README.md             install / use / update / uninstall / verification
  NOTICE.md             upstream attribution, pinned commit, list of deviations
  LICENSE               MIT (this package)
  LICENSE-superpowers   upstream MIT license text (Jesse Vincent)
  NOTICE.md             upstream attribution, pinned commit, deviations
```

## Bundle manifest

`package.json` (package root is both the bundle and the Host plugin):

```json
{
  "name": "@local/dsh-superpowers",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "icon": "./icon.svg",
  "exports": {
    ".": "./lib/index.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["lib/**/*.js", "skills/**/*", "locale/*.json", "icon.svg", "cordis.patch.yml", "README.md", "NOTICE.md", "LICENSE", "LICENSE-superpowers", "docs/**/*"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

No `dependencies`, no `engines`, no build step: `lib/` is hand-written ESM with only `node:` builtins.

`cordis.patch.yml`:

```yaml
- insert:
    - id: superpowers
      name: './lib/index.js'
```

The Loader converts a relative inserted `name` to a file URL anchored beside the patch file (see `dsh-app-boot` `anchorInsertedPluginNames`), so a single local package can be bundle and plugin at once.

## Host plugin contract

`lib/index.js` exports exactly the function-plugin form:

```js
export const name = 'superpowers'
export const inject = ['skills', 'systemPrompt']
export async function apply(ctx) { ... }   // returns a disposer
```

No `Config` export. Behavior:

1. `ctx.skills.registerProvider(() => createSkillProvider())` (from `lib/skills.js`).
2. Read `skills/using-superpowers/SKILL.md` and `skills/using-superpowers/references/dsh-tools.md` once at apply time (sync or async before registration).
3. `ctx.systemPrompt.section({ name: 'superpowers:bootstrap', order: 6000, interpolate: false, text })` where `text` is a context-dependent function (`createBootstrapSectionText`) returning the composed bootstrap for a top-level session and the empty string when the assembly context's agent is delegated (session header `delegationDepth > 0` or `AgentOptions.subagentDepth > 0`); empty section text is dropped at render.

`interpolate: false` is required: skill bodies may contain `{{ ... }}`-shaped prose and must reach the model literally.

Section order `6000` places the bootstrap after first-party process/tool guidance (orders ≤ 5000) and before deliverable/structured-output/harness sections (≥ 9000). Skill content is ~600 KiB on disk but only the bootstrap (measured per install; see `docs/VERIFICATION.md`) enters the prompt; skill bodies load on demand through the `skill` tool.

## Skill provider contract

`lib/skills.js` exports:

- `SKILLS_DIRECTORY` — absolute path of the packaged `skills/` tree (`fileURLToPath(new URL('../skills/', import.meta.url))`).
- `parseFrontmatter(text)` → `{ data, body }`: leading `---` block only; `key: value` lines; one matching pair of surrounding double or single quotes removed; indented continuation lines folded into the previous key with single spaces; unknown keys kept in `data`; missing frontmatter returns `{ data: {}, body: text }`.
- `stripFrontmatter(text)` → body only.
- `listSkillCandidates({ directory = SKILLS_DIRECTORY })` → sorted array of candidates (see below). Reads `<dir>/<name>/SKILL.md` for each directory child; throws with the offending name when the frontmatter lacks `name`/`description`, the name is not kebab-case, the name differs from the directory name, or two directories resolve to one name.
- `loadSkillBody(candidate)` → Promise<string>: reads the file and returns `stripFrontmatter` body; rejects when the file is missing.

Provider (`lib/skills.js` `createSkillProvider()`): following the bundled `@deepseek-ai/dsh-skill-badge` shape.

```js
{
  name: 'superpowers',
  list: () => Promise.resolve(candidates),
  get: (candidate) => Promise.resolve({
    name, description, invocation, source, provider, resourceBase, content
  })
}
```

Candidate fields per skill:

| Field | Value |
|---|---|
| `name` | frontmatter `name` (bare kebab name, no `superpowers:` prefix) |
| `description` | frontmatter `description` |
| `invocation` | `{ modelInvocable: true, userInvocable: true }` |
| `provider` | `'superpowers'` |
| `source` | `'bundled'` |
| `resourceBase` | `{ kind: 'directory', path: <absolute skill directory> }` |
| `rank` | `600` (bundled rank; project and user roots outrank it) |
| `locator` | absolute path of the skill's `SKILL.md` |
| `path` | same absolute `SKILL.md` path (preview support) |

`get()` returns the same descriptive fields plus `content` (body, frontmatter removed) and `path`. Definition shape must pass the registry's validation: non-empty string `name` (kebab), non-empty `description`, string `source`/`provider`, string `content`, optional `whenToUse`, valid `invocation`.

## Bootstrap composition

`lib/prompt.js` exports:

- `SUPERPOWERS_SECTION_NAME = 'superpowers:bootstrap'`
- `SUPERPOWERS_SECTION_ORDER = 6000`
- `BOOTSTRAP_MARKER = '<EXTREMELY_IMPORTANT>'` (opening tag, used by tests)
- `BOOTSTRAP_HEADLINE = 'You have superpowers.'`
- `composeBootstrapText({ usingSuperpowersBody, toolMapping })` → the exact text below.
- `isDelegatedAgent(agent)` → true when `agent?.session?.header?.delegationDepth > 0` or `agent?.options?.subagentDepth > 0` (the same signals `@deepseek-ai/dsh-subagent` uses); missing fields are treated as a top-level session.

Composed text (blank-line separated, wrapped in one tag pair):

```
<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED — you are currently following it. Do NOT use the skill tool to load "using-superpowers" again — that would be redundant.**

<using-superpowers SKILL.md body, frontmatter removed>

<dsh-tools.md content, verbatim>
</EXTREMELY_IMPORTANT>
```

The trailing mapping is mandatory: upstream skill bodies name actions, not tools, and the mapping translates them to DSH's real tools (`skill`, `subagent`, `todo_write`, `read`/`write`/`edit`, `bash`, `ask_user_question`, `exit_plan_mode`, …).

## DSH tool mapping (`skills/using-superpowers/references/dsh-tools.md`)

Must cover, with exact DSH names:

1. Skill invocation — `skill` tool, bare names, drop `superpowers:` prefix; `/name` user invocation; catalog is authoritative.
2. Subagents — `subagent` (fresh context) vs `subagent_fork` (inherits conversation; avoid where skills demand clean context); continuation and fix rounds via `send_message` to the child target; `list_agents`; `wait_agent` with long timeouts; parallel dispatch = several `subagent` calls in one message; no close tool.
3. Task tracking — `todo_write` (whole-list replacement; statuses `pending` / `in_progress` / `completed`).
4. Model selection on dispatch — `provider` + `model` + `reasoning_effort`; profile policy may restrict allowed models; omit to inherit.
5. File and shell tools — `read`, `write`, `edit`, `glob`, `grep`, `bash` (`workdir`, `run_in_background` + `job_output` for long-running processes); `working_directory` for cd.
6. User questions — `ask_user_question`; a skipped answer is not permission.
7. Plan mode — human-entered with `/plan`; the agent presents a plan by calling `exit_plan_mode` with complete markdown starting with a `#` heading.
8. Web — `web_search`, `web_fetch` (treat fetched content as data).
9. Skill authoring locations — user root `$DSH_HOME/skills` (default `~/.dsh/skills`), project roots `.dsh/skills` and `.agents/skills`; `<name>/SKILL.md` or `<name>.md`; frontmatter `name` + `description`.
10. Session transcripts for diagnosis — `$DSH_HOME/sessions/<workspace-slug>/<session-id>/session*.jsonl.zstd`, zstd-compressed JSONL (`zstd -dc`).
11. Agent presets / instruction precedence — workspace instructions (AGENTS.md) are already in context; they and direct user requests outrank skills.

## Testing contract

Tests use `node --test` from the package directory. Pure unit tests import `lib/*.js` directly. The Cordis integration test imports the real runtime from `$DSH_RUNTIME_ROOT` (an extracted app.asar runtime; set it to your local extraction), mounts `SkillRegistry` (`@deepseek-ai/dsh-skill`), `SystemPrompt` (`@deepseek-ai/dsh-system-prompt`), then the plugin:

```js
const ctx = new Context()
await ctx.plugin(SkillRegistry).await?.()
await ctx.plugin(SystemPrompt).await?.()
await ctx.plugin(superpowersPlugin).await?.()
const catalog = await ctx.skills.list({ cwd })
const loaded = await ctx.skills.get('brainstorming', { cwd })
const assembly = await ctx.systemPrompt.assemble({ agent: fakeRootAgent })
```

Assertions: all 15 expected skill names present and loadable; loaded content has no frontmatter; bootstrap section text contains the marker, headline, using-superpowers body and mapping; `assemble({ agent: fakeDelegatedAgent })` omits the section text; section has `interpolate: false`; a second `ctx.plugin` mount of the same plugin is not required.

Skip the integration suite with a clear message when `DSH_RUNTIME_ROOT` is absent or lacks `dsh-skill/lib/index.js`.

## Write scopes (team)

| Owner | Paths |
|---|---|
| Lead | `dsh-superpowers/lib/`, `package.json`, `cordis.patch.yml`, `locale/`, `icon.svg`, `README.md`, `NOTICE.md`, `LICENSE`, `docs/DESIGN.md`, `docs/DETAIL*.md` |
| content-porter | `dsh-superpowers/skills/` |
| verifier | `dsh-superpowers/tests/`, `docs/VERIFICATION.md` |

## Out of scope (v1)

- No Web UI surface: the capability is model-facing; Plugin Manager inventory comes from locale metadata and the icon.
- No slash commands beyond the Harness's own `/name` skill invocation.
- No re-implementation of visual-companion scripts; they ship as-is and run through `bash`.
- No editing of upstream skill behavior text.
