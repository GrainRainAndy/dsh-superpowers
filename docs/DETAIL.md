# Implementation detail

Companion to [README.md](../README.md). This document records the contracts this
port relies on, why each choice was made, and what can break.

## 1. Upstream and porting rules

- Upstream: Superpowers v7.0.2, commit `22f0b463e7a5e579904dd6211a520321035526f7`.
- The `skills/` tree is copied verbatim: content parity is checked with `diff -r`
  against a clean upstream checkout.
- The upstream porting guide forbids rewriting skill bodies to fit a harness.
  A port adds (a) a tool-mapping reference and (b) a bootstrap injector. This
  package does exactly that:
  - added: `skills/using-superpowers/references/dsh-tools.md`;
  - added: one bullet in `skills/using-superpowers/SKILL.md` under
    "Platform Adaptation";
  - added: `lib/` (provider + bootstrap section), package metadata, locale,
    icon.
- The only other upstream files untouched by design are the other harness
  reference documents (`claude-code-tools.md`, `codex-tools.md`, …). They stay
  because the skill tree is upstream's own; the DSH bootstrap does not point at
  them.

## 2. Package anatomy

| Path | Role |
|---|---|
| `package.json` | bundle manifest: `dsh.bundle.patch`, `exports`, `files`, top-level `icon` |
| `cordis.patch.yml` | one inserted Host row, id `superpowers`, module `./lib/index.js` |
| `lib/index.js` | Cordis plugin: provider registration + prompt section |
| `lib/skills.js` | discovery, frontmatter parsing, provider |
| `lib/prompt.js` | bootstrap composition, section constants, delegation detection |
| `skills/` | upstream tree, 15 skill directories, 81 files (80 upstream + mapping) |
| `locale/{en,zh}.json` | Plugin Manager `meta.title` / `meta.description` / `meta.detail` |
| `icon.svg` | original 36×36 SVG, DSH accent blue |
| `tests/` | `node --test` suites (unit, Cordis integration, manifest, parity) |
| `docs/` | this document, design contract, verification record |

## 3. Bundle layer and installation

A profile is composed from an empty entry list by applying each selected
bundle's patch in order, then the profile's own patch. `install_bundle`:

1. runs pnpm to add the directory to the profile, which produces a
   `link:<absolute-path>` dependency and a symlink in the profile's
   `node_modules`;
2. reads the bundle's `package.json` → `dsh.bundle.patch` →
   `cordis.patch.yml`;
3. applies the patch layer and selects the bundle name in the profile manifest;
4. reloads the composition on live surfaces.

`dsh-app-boot`'s `anchorInsertedPluginNames` converts the inserted relative
`name` (`./lib/index.js`) into a `file:` URL anchored beside the patch file, so
one package can be both the bundle and the Host plugin. Because the install is a
link, editing `skills/` in the checkout is visible to the next skill load, while
`lib/` changes require a Host restart (module generation is cached).

No `dependencies` and no install scripts: the plugin imports only `node:fs`,
`node:fs/promises`, `node:path`, and `node:url`. The app's version-compatibility
gate has no requirement to evaluate (no `engines.dsh`, no `@deepseek-ai/dsh*`
peer dependencies).

## 4. Host plugin lifecycle

```js
export const name = 'superpowers'
export const inject = ['skills', 'systemPrompt']
export async function apply(ctx) { … return dispose }
```

- `apply` reads the two bootstrap sources before registering anything, so a
  packaging error fails loudly instead of publishing a half-working plugin.
- Both registrations are effects owned by the plugin fiber; the returned
  disposer also disposes them explicitly, so either teardown path is clean.
- No `Config` export: there is nothing to tune safely. Enable/disable is the
  bundle/row switch; content tuning happens in the linked checkout.

## 5. Skill provider contract

`ctx.skills` is the registry; providers are contributed with
`ctx.skills.registerProvider(create)`, where `create(control)` returns a
`{ name, list, get }` object. The provider name is `superpowers`.

Candidates produced per skill:

| Field | Value | Why |
|---|---|---|
| `name` | frontmatter name, bare kebab-case | matches registry grammar; cross-skill references use `superpowers:<name>`, the bootstrap says to drop the prefix |
| `description` | frontmatter description | catalog text |
| `invocation` | `{modelInvocable: true, userInvocable: true}` | model loads it; user `/name` invocation allowed |
| `provider` | `superpowers` | must equal the provider's `name` (registry validates this) |
| `source` | `bundled` | provenance shown to consumers |
| `resourceBase` | `{kind: 'directory', path: <skill dir>}` | load-bearing: bodies reference `references/*`, `scripts/*`, and sibling-skill paths; the `skill` tool renders this base directory so the model can resolve them |
| `rank` | `600` | `BUNDLED_SKILL_RANK`; project roots (100/200), custom (300), user roots (400/500) override same-named bundled skills |
| `locator`, `path` | absolute `SKILL.md` path | `get` reads through it; `path` supports preview consumers |

`get(candidate)` re-reads the file and returns the definition with frontmatter
removed. Discovery is cached per provider instance; body loads are not, matching
the filesystem provider's behavior. Discovery failures throw a named error
rather than silently dropping a skill: packaged content is validated by tests,
so a load-time failure means the package itself is broken.

## 6. Bootstrap composition

```
<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: … ALREADY LOADED … Do NOT use the skill tool to load "using-superpowers" again …**

<using-superpowers body, frontmatter removed>

<dsh-tools.md, verbatim>
</EXTREMELY_IMPORTANT>
```

Registered as `ctx.systemPrompt.section({ name: 'superpowers:bootstrap', order:
6000, interpolate: false, text })`.

- `interpolate: false` is mandatory: skill prose contains brace-shaped text and
  must reach the model literally.
- Order 6000 sits after first-party process/tool guidance (≤ 5000) and before
  deliverable, structured-output, and harness-source sections (≥ 9000). The
  exact number is a presentation choice, not a contract; changing it only moves
  the block inside the system prompt.
- Section text is computed once per plugin activation; prompt assembly runs it
  per step but the text is static within a session.
- The section is registered globally (profile-wide), which is what makes
  "every top-level session, no per-session opt-in" true. Subagent suppression is
  handled inside the text provider (§7).

Measured size is recorded in [VERIFICATION.md](VERIFICATION.md); the cost is
paid by every request in a top-level session.

## 7. Delegated-session suppression

The section text provider returns `''` (dropped at render) when the assembly
context's agent is delegated:

```js
agent?.session?.header?.delegationDepth > 0 || agent?.options?.subagentDepth > 0
```

These are the same signals `@deepseek-ai/dsh-subagent`'s `delegationDepthOf()`
combines. Rationale: Superpowers' subagent workflows spend the most effort
keeping fresh workers from restarting design/approval cycles; upstream issue
handling for other in-process harnesses shows model-compliance markers alone are
unreliable, so the port detects the structural signal. Skills stay registered in
every session, so a dispatch prompt can still ask a worker to load one
explicitly.

A missing agent (e.g. an assembly without an agent, such as a presentation
probe) counts as a top-level session and receives the bootstrap.

## 8. Tool mapping

`skills/using-superpowers/references/dsh-tools.md` covers, with the real tool
schema for each: skill invocation and `/name` user invocation, subagent
dispatch/continuation/lifecycle/waiting/parallelism/model selection, `todo_write`,
file and search tools, `bash` semantics (fresh shell, `workdir`,
background/job tools, sandbox denials), `ask_user_question` (including the
"skipped is not permission" contract and the profile-conditional timed variant),
plan mode (human-entered `/plan`, `exit_plan_mode` presentation), web tools,
skill authoring roots and frontmatter, session transcript locations, and
instruction precedence.

It is explicit about what DSH does **not** have (native worktrees, subagent
close/status tools, `subagent_type`, `CLAUDE_PLUGIN_ROOT`, `~/.claude` paths,
agent-side plan-mode entry), telling the model to use the skills' own fallback
wording instead of inventing a tool.

Two facts are profile-conditional and stated as such in the mapping:

- `wait_agent` and Agent-Teams tools exist only where the profile mounts them.
  In an Agent-Teams profile the Team tools shadow the base subagent-control
  tools, so continuable workers are spawned with `spawn_teammate` and steered
  with `send_message`; plain `subagent` children expose only pushed completion
  notices.
- `ask_user_question`'s `timeout` parameter exists only in the `timed` variant
  (`@deepseek-ai/dsh-tool-ask-user` `mode: "timed"`); the default `legacy`
  variant has no timeout parameter.

## 9. Content parity

`tests/upstream-parity.test.mjs` (and the manual `diff -r` command in
[VERIFICATION.md](VERIFICATION.md)) enforce that the packaged tree differs from
upstream only by the added mapping file and the single Platform Adaptation line.
This is the mechanism that prevents well-meant "harness tuning" from creeping
into behavior-shaping skill text.

## 10. Failure modes and diagnostics

| Symptom | Meaning / action |
|---|---|
| Bundle row failed / plugin absent | Plugin `apply` rejected — usually a missing packaged file (the error names the path). Restore the file or reinstall. |
| Bundle lists but no bootstrap in a new session | Session belongs to a profile without the row (check `--dump-config`) or is delegated (expected). |
| Skill catalog unchanged | Another layer disabled the row, or the profile's skill tool is not mounted. `plugin_manager list_plugins` shows the row's fiber phase. |
| Skill name collisions | A project/user skill with the same name outranks the bundled one (rank semantics); upstream behavior is preserved by wrapping rather than renaming. |
| Uninstall breaks boot | The profile links this checkout; if the directory disappeared first, remove the link via `plugin_manager remove_bundle` and restart. |

## 11. Trust and security

- Everything injected is packaged, trusted content (upstream MIT skills plus
  this package's mapping). There is no network code and no runtime input that
  can inject into the bootstrap.
- The bootstrap is behavior-shaping prompt text; like any system-prompt
  content, a compromised checkout could change model behavior. The bundle is
  installed by explicit user action and can be disabled at any time.
- Skill scripts execute as the user through `bash`, exactly like any other
  repository script the agent runs; the Harness's sandbox/approval policy still
  applies.
- Session transcript guidance in the mapping is read-only.

## 12. Design decisions and rejected alternatives

| Decision | Alternative | Why |
|---|---|---|
| System-prompt section | Durable user-role context injected on first step (Claude Code `SessionStart` shape) | Prompt section is simpler, static per session, survives compaction by construction, and needs no session-log writes. Cost: it lives in the system prompt rather than history. |
| Own skill provider | Reuse `dsh-skill-filesystem` with a `customSkillDirs` row pointing into the package | Filesystem provider paths would need an absolute install path in the patch; a provider keeps the package self-contained and gives exact provenance (`provider: superpowers`, `source: bundled`). |
| Bare skill names | Register `superpowers:<name>` | Registry names are bare kebab-case; cross-references keep their upstream form and the mapping instructs dropping the prefix. |
| Structural subagent suppression | Rely on the upstream `<SUBAGENT-STOP>` marker only | Markers are compliance-based; the inline harnesses added structural detection after real failures. |
| Mapping reference only | Rewriting skill bodies with DSH tool names | Upstream porting rules treat skill text as tuned behavior code; the mapping isolates harness knowledge in one file. |
| Single package | Bundle package + separate plugin package | The loader anchors relative inserted paths beside the patch file, so one package is enough; fewer install-moving parts. |

## 13. Compatibility notes

- Built and verified against DSH `0.2.2-rc.1`.
- Relies on: `ctx.skills.registerProvider`/`skills.list`/`skills.get` service
  contract, `ctx.systemPrompt.section`, delegated-agent signals
  (`session.header.delegationDepth`, `AgentOptions.subagentDepth`), and the
  inserted-row path anchoring in `dsh-app-boot`.
- If a future DSH changes the provider contract or the section order table, the
  integration test fails first; the test suite is the canary.
- Updating the port to a newer upstream Superpowers release: replace `skills/`
  from the new commit, re-apply the two sanctioned deviations (copy the new
  tree's `dsh-tools.md` is a fresh file; re-add the Platform Adaptation line),
  bump the pinned commit in `NOTICE.md`, and re-run the parity + catalog tests.
