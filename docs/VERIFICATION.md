# Verification — dsh-superpowers

Independent verification of the DSH port of [obra/superpowers](https://github.com/obra/superpowers)
v7.0.2. The suite and this report were written by `verifier` against `docs/DESIGN.md`; the verifier
did not edit `lib/`, `package.json`, `cordis.patch.yml`, `locale/`, `icon.svg`, `skills/`, or
`README.md`.

Status: **verification complete — 105/105 tests pass, live `plugin_manager install_bundle` applied
without warnings, and the fresh-session acceptance run passed; no open blocking defects.** Offline
evidence is in §1–§9; the Lead-owned live gates and this verifier's independent re-check of them are
in §10. Remaining non-blocking limits are listed in §7.

## 1. Method

- Pure unit tests import `lib/*.js` directly.
- The Cordis integration suite imports the **real extracted DSH runtime** and mounts
  `SkillRegistry` → `SystemPrompt` → this package's plugin, then asserts observable catalog, loaded
  definitions, prompt assembly, teardown/reload behavior, and rank precedence against the runtime's
  own filesystem skill provider.
- Installability tests call the runtime's own `dsh-app-boot` helpers (patch anchoring, Plugin
  Manager metadata) and compose a simulated profile containing the package, rather than
  re-implementing those rules.
- Upstream parity compares the packaged tree byte-for-byte with the pinned reference checkout.
- No external test dependencies; `node:test` and `node:` builtins only. No network access.

## 2. Environment

| Item | Value |
|---|---|
| OS | macOS 27.0.1 (darwin) |
| Node.js | v26.12.1 |
| DSH runtime | extracted app.asar runtime, `@deepseek-ai/dsh` 0.2.2-rc.1 |
| Runtime root used | `/Users/grainrain/Developer/AgentHome/.ref/dsh-asar/dsh` (default `$DSH_RUNTIME_ROOT`) |
| Reference checkout | `/Users/grainrain/Developer/AgentHome/superpowers-ref` at `22f0b463e7a5e579904dd6211a520321035526f7` (v7.0.2), working tree clean |
| Package under test | `@local/dsh-superpowers` 1.0.0, 100 non-test files (includes `docs/ACCEPTANCE.md` and the archived acceptance session log), 15 skill directories / 81 skill-tree files |
| DSH runtime packages used | `cordis` 4.1.0, `dsh-skill`, `dsh-system-prompt`, `dsh-skill-filesystem`, `dsh-app-boot` (same 0.2.2-rc.1 extraction) |
| Live profiles | `desktop` (bundle installed 2026-11-08 via `plugin_manager`, `link:` dependency, still enabled); `superpowers-e2e` headless profile (acceptance run, cleaned up) |

Measured prompt/composition sizes (final tree):

| Measurement | Value |
|---|---|
| `skills/using-superpowers/SKILL.md` body (frontmatter stripped) | 3,042 B |
| `skills/using-superpowers/references/dsh-tools.md` | 9,890 B on disk (140 lines), 9,889 B trimmed |
| Composed bootstrap | **13,218 B** / 13,174 chars / 208 lines (one opening and one closing underscore tag) |
| `icon.svg` | 315 B, 36×36 SVG |

## 3. Test inventory

| File | Tests | Covers |
|---|---|---|
| `tests/unit-skills.test.mjs` | 34 | frontmatter parsing (plain/quoted/folded/CRLF/missing), `stripFrontmatter`, candidate discovery (15 names, sort, field contract, resourceBase, locator), failure paths, body loading, provider list/get/caching |
| `tests/unit-prompt.test.mjs` | 20 | section name/order, compose shape and member order, whitespace handling, empty-source rejection, tag balance, `isDelegatedAgent` (`session.header.delegationDepth`, `AgentOptions.subagentDepth`, missing shapes), section text provider |
| `tests/integration-cordis.test.mjs` | 18 | plugin module shape; catalog (15 sorted, summary fields); every skill loadable through `ctx.skills.get` with a valid definition and frontmatter-free body; resourceBase correctness; skill-tool rendering path; bootstrap registration (`interpolate: false`, order 6000); root assembly full text; delegated omission (header and `subagentDepth`); disposal; remount after disposal (HMR reload path); bundled-rank precedence vs the real filesystem provider |
| `tests/manifest-content.test.mjs` | 25 | `package.json` identity/exports/files/dsh patch/no dependencies; upstream license shipping; `cordis.patch.yml`; icon (< 256 KiB, 36×36 SVG); locale en+zh meta and `meta.detail`; 15 SKILL.md parse (name == directory); dsh-tools coverage plus corrected-claim negatives; bootstrap size guard; lib hygiene |
| `tests/installability.test.mjs` | 4 | `bundlePatchPaths`; runtime patch parsing and `./lib/index.js` anchoring; simulated profile composition; Plugin Manager metadata (locale + icon) through package exports |
| `tests/upstream-parity.test.mjs` | 4 | pinned reference commit; only `references/dsh-tools.md` added; byte-identical shared files; exactly one inserted line in `using-superpowers/SKILL.md` |
| **Total** | **105** | |

## 4. Commands and results

Primary command (from the package directory):

```
cd /Users/grainrain/Developer/GitHub/dsh-superpowers
node --test tests/
```

Final result:

```
tests 105
suites 21
pass 105
fail 0
cancelled 0
skipped 0
todo 0
```

Re-run after the live install and after `docs/ACCEPTANCE.md` + `docs/evidence/` were added to the
package: **same 105/105, 21 suites, 0 fail** — no test depends on those additions.
`diff -r superpowers-ref/skills dsh-superpowers/skills` was also re-run after the live work and is
unchanged (one inserted line + the one added file; see below).

Per-file isolation runs (all green):

| File | pass/fail |
|---|---|
| `tests/unit-skills.test.mjs` | 34 / 0 |
| `tests/unit-prompt.test.mjs` | 20 / 0 |
| `tests/integration-cordis.test.mjs` | 18 / 0 |
| `tests/manifest-content.test.mjs` | 25 / 0 |
| `tests/installability.test.mjs` | 4 / 0 |
| `tests/upstream-parity.test.mjs` | 4 / 0 |

Runtime-skip behavior (no runtime at the configured root) — suites skip with an explicit message,
nothing else fails:

```
DSH_RUNTIME_ROOT=/nonexistent-runtime node --test tests/
# ﹣ bundle installability (extracted runtime) # DSH runtime not found under ...
# ﹣ Cordis integration                        # DSH runtime not found under ...
# ﹣ bundled rank precedence (filesystem provider) # DSH runtime not found under ...
# tests 84, pass 84, fail 0
```

Upstream diff (only the two sanctioned deviations; exit code 1 is expected for a difference):

```
cd /Users/grainrain/Developer/AgentHome
diff -r superpowers-ref/skills dsh-superpowers/skills
61a62
> - DeepSeek Harness (dsh): `references/dsh-tools.md`
Only in dsh-superpowers/skills/using-superpowers/references: dsh-tools.md
```

Packaging check (`files` semantics, no tarball written):

```
npm pack --dry-run --json   # 98 files
# includes: LICENSE, LICENSE-superpowers, NOTICE.md, README.md, README.zh.md,
#           docs/DETAIL.md, docs/DETAIL.zh.md, docs/DESIGN.md, docs/VERIFICATION.md,
#           icon.svg, cordis.patch.yml, lib/*.js, locale/*.json, skills/** (81 files)
# excludes: tests/**  (intended: tests are not shipped)
```

## 5. Adversarial review against DESIGN.md

### 5.1 Prompt injection and assembly

- **`interpolate: false` is real, not just declared.** The integration suite captures the actual
  `systemPrompt.section()` registration (`lib/index.js:41-46`) and asserts `interpolate === false`;
  the assembled section keeps it and the runtime's `renderPrompt` returns the text literally. The
  current composed bootstrap contains no `{{`; a future skill body with `{{...}}` prose is protected
  by the flag.
- **Empty sections are dropped at render.** Delegated assemblies keep the registration but the
  section text is `''` (`lib/prompt.js:99`), and `renderPrompt` filters empty text, so the marker is
  absent from the rendered prompt. Verified through the real `SystemPrompt` service for session
  header depth 1, depth 2, and `AgentOptions.subagentDepth: 1`.
- **Delegation detection matches the platform.** `isDelegatedAgent` checks both the durable session
  header `delegationDepth` and the live `AgentOptions.subagentDepth` (`lib/prompt.js:83-86`) — the
  two signals `delegationDepthOf` uses (`dsh-subagent/lib/index.js:112-116`). Child sessions persist
  the header depth at creation (`dsh-subagent/lib/index.js:340-356`), so the gate works for durable
  and pre-persist children. `DESIGN.md:84`/`:137` document the same rule.
- **Tag balance / framing.** The composed block contains exactly one `<EXTREMELY_IMPORTANT>` and one
  `</EXTREMELY_IMPORTANT>`; none of the 15 skill bodies or `dsh-tools.md` contains the underscore
  wrapper tags (upstream uses the hyphenated `<EXTREMELY-IMPORTANT>`, which cannot close the
  wrapper). Tests fail if a future skill body introduces the underscore tag.
- **Section order.** Registration order is 6000 (`lib/prompt.js:18`, `lib/index.js:42`), between the
  runtime's first-party tool sections (`TOOL_SDK` = 5000) and deliverable/structured-output sections
  (9000/9900 in `dsh-system-prompt`). In assembly the section sits after `harness:identity` and
  before `deployment:persona-suffix`.
- **Prompt cost.** The composed bootstrap is 13,218 B (~3.3k tokens at the usual ~4 chars/token), of
  which 9,889 B is the mandatory DSH tool mapping. DESIGN now defers to this measurement
  (`DESIGN.md:88`); earlier drafts estimated 8–10 KiB, which was stale (see O1, resolved).

### 5.2 Provider contract and rank semantics

- The real registry validates every candidate (`validateCandidate`) and every loaded definition
  (`validateDefinition`). All 15 skills pass with `provider: 'superpowers'`, `source: 'bundled'`,
  `invocation: {modelInvocable: true, userInvocable: true}`, finite `rank`, absolute `path`, and a
  directory `resourceBase`; `get()` returns the candidate's own name, so the registry's
  stale-definition guard is satisfied.
- `rank: 600` equals the runtime's `BUNDLED_SKILL_RANK` (asserted against the imported constant).
  Precedence was verified end-to-end, not by reading: with the runtime's filesystem provider
  mounted, a custom-root skill named `brainstorming` (rank 300) wins the catalog row and
  `ctx.skills.get`, while unshadowed packaged skills stay provider `superpowers`; the catalog still
  lists 15 names.
- `list()` returns a plain array, which the registry treats as a complete observation; a rejected
  discovery promise is reset so the next catalog read retries.
- Provider and candidate names must be equal — `createSkillProvider` derives both from the same
  constants, and the runtime mount would throw otherwise.

### 5.3 resourceBase correctness

- For all 15 skills, `resourceBase.path` equals `dirname(path)` of the real `SKILL.md`, exists, and
  is a directory; the skill-tool rendering path (`renderSkillContent`) emits
  `Base directory for this skill: <path>` plus the verbatim body.
- Referenced files resolve for the skills that ship them: `brainstorming/scripts/*`,
  `executing-plans/scripts/*`, `subagent-driven-development/{prompt,references,scripts}/*`,
  `systematic-debugging/*`, `requesting-code-review/code-reviewer.md`,
  `writing-skills/references/*`, and `using-superpowers/references/*` including `dsh-tools.md`.
- Executable bits on upstream helper scripts match the reference checkout (checked
  `task-done`, `sdd-repo`, `find-polluter.sh`, `render-graphs.js`, `start-server.sh`); no symlinks
  were introduced.

### 5.4 Installability and patch anchoring

- `cordis.patch.yml` contains one insert row (`id: superpowers`, relative anchor `./lib/index.js`).
  The runtime's own `bundlePatchPaths` + `loadOverlayPatches` resolve the anchor to
  `file:///…/<package>/lib/index.js` beside the patch file; the target exists.
- A simulated profile (temporary directory with `node_modules/@local/dsh-superpowers` linked and a
  `package.json` whose `dsh.profile.bundles` lists the package) loads with zero skipped bundles, one
  bundle layer, one patch, and the anchored file-URL row — the composition path
  `plugin_manager install_bundle` uses, with no absolute install path baked into the patch.
- Plugin Manager inventory metadata resolves through the package exports:
  `readPluginMeta('@local/dsh-superpowers', …)` returns English + Chinese `title`/`description` and
  an SVG data URI icon; the icon is 315 B, well under the 256 KiB cap, and lives inside the package.
  `locale/{en,zh}.json` declare `meta.detail`, and `docs/DETAIL.md` / `docs/DETAIL.zh.md` exist.
- `package.json` declares no dependencies and no install scripts, so `install_bundle` should not
  require build-script approval. `files[]` includes `LICENSE-superpowers` (NOTICE.md points at it)
  and `npm pack --dry-run` confirms it is shipped together with both READMEs and both DETAIL docs.

### 5.5 Failure modes, content accuracy, and live-profile risk

Verified against temporary package copies:

- **Missing bootstrap input fails loudly.** Deleting `dsh-tools.md` makes the plugin's `apply` reject
  with `ENOENT`; in a real boot that surfaces as a startup error rather than a silent half-install.
- **A corrupted `SKILL.md` does not fail boot.** It makes `provider.list()` reject; the registry
  contains the failure to a logged warning (`skill provider "superpowers" skipped: …`) and the
  session catalog is empty. The test suite prevents this from shipping; a post-install corrupted
  file would hide all 15 skills behind one warning log (O5).
- **Global names.** Provider name `superpowers` and section name `superpowers:bootstrap` are
  profile-global. A duplicate registration (e.g. mounting the bundle twice) throws at startup —
  loud, not silent. No existing runtime package uses either name.
- **Live profile.** Installing this bundle changes the system prompt of every top-level session in
  that profile by 13,218 B and adds 15 catalog entries; uninstalling requires removing the bundle
  from `dsh.profile.bundles` (a profile with HMR may need a restart). Deleting the package directory
  while the bundle is still selected makes profile loading fail (`loadOverlayPatches` throws on the
  missing patch). These are Lead-owned live-install steps (§7).
- **Tool-mapping content accuracy.** Claims in `dsh-tools.md` were checked against
  `@deepseek-ai/dsh` 0.2.2-rc.1: skill-tool rendering, subagent / `send_message` / `list_agents` /
  `interrupt_agent` names, `started subagent <id>` text, `todo_write` statuses, `exit_plan_mode`
  heading requirement and `/plan off`, `ask_user_question` semantics, transcript path
  `session.v4.jsonl.zstd` and `--<project-key>--` layout, `$DSH_*` bash variables, skill-root
  precedence (project 100/200 < custom 300 < user 400/500 < bundled 600), flat `<name>.md`
  discovery, and the Agent Teams shadow paragraph (accurate for this desktop profile). Three claims
  were corrected during verification and are now pinned by tests: (a) `ask_user_question`'s default
  schema is the question batch only — a `timeout` parameter exists only in the deployment-enabled
  timed variant; (b) plan mode restrains by guidance text only and does not policy-block tools;
  (c) frontmatter keys are `disable-model-invocation` and `user-invocable`, not the legacy
  `model-invocable`.

## 6. Defects and findings

Severity: **blocking** = contradicts DESIGN.md; **observation** = no contract breach, no action
required for DoD. No blocking defects remain.

| ID | Severity | Status | Location | Finding |
|---|---|---|---|---|
| D1 | blocking | **resolved** | `package.json:19`, DESIGN §Package layout | `README.md` was missing; now present (8,794 B, 114 lines) together with `README.zh.md`. |
| D2 | blocking | **resolved** | `locale/en.json:5` | `meta.detail` points at `docs/DETAIL.md`; the file now exists and is shipped. |
| D3 | blocking | **resolved** | `locale/zh.json:5` | `meta.detail` points at `docs/DETAIL.zh.md`; the file now exists and is shipped. |
| O1 | observation | **resolved** | `DESIGN.md:88` | Bootstrap size estimate was stale (8–10 KiB); final composition measures 13,218 B and DESIGN now defers to this report's measurement. |
| O2 | observation | **resolved** | `NOTICE.md:10`, `NOTICE.md:34`, `package.json:13-23` | `LICENSE-superpowers` was not in `files[]`; it is now declared and `npm pack --dry-run` ships it. |
| O3 | observation | open (no action) | `lib/skills.js:120-123` | The duplicate-name throw branch is unreachable: the `name === directory` rule throws first and directory children cannot share a name. Defensive dead code. |
| O4 | observation | **resolved** | `lib/prompt.js:83-86`, `DESIGN.md:84`, `:137` | Delegation detection originally checked only the session header; it now also checks `AgentOptions.subagentDepth` (the platform's canonical `delegationDepthOf` signals) and DESIGN/tests were updated. |
| O5 | observation | open (no action) | `lib/skills.js` discovery via `@deepseek-ai/dsh-skill` | A corrupt packaged `SKILL.md` is contained by the registry as a warning + empty catalog rather than a boot failure (verified). Acceptable because tests gate the content; noted for post-install corruption diagnosis. |
| O6 | observation | open (no action) | `lib/index.js:40-46` | Provider name `superpowers` and section name `superpowers:bootstrap` are global; a duplicate mount throws at boot. Loud failure is acceptable; no collision exists in the shipped runtime. |
| O7 | observation | open (no action) | `DESIGN.md:84` vs `lib/index.js:45` | DESIGN describes section `text` as a string ("the composed bootstrap or … the empty string"); the implementation registers a context-dependent text function, which is required for delegation gating and matches the testing contract. Doc wording only. |

## 7. Residual verification limits

- **Live install was executed by the Lead; this report re-checks its state and evidence, not the
  `plugin_manager` call itself.** Independent checks in §10.1 cover the profile manifest, the
  `link:` dependency, the `node_modules` symlink, and the composition; the call's JSON result is
  quoted from the Lead.
- **No live delegated-child negative control.** Delegated suppression is verified at assembly level
  through the real `SystemPrompt` service (header depths 1/2 and `AgentOptions.subagentDepth`), not
  by dispatching a real child agent in a live profile.
- **Desktop fresh-session coverage is partial.** The Desktop evidence is a mid-session system-prompt
  update in an existing long-running top-level session (seq 13 → seq 1442, §10.2). A brand-new
  Desktop session started after install was not sampled; the fresh-session acceptance run happened
  in the headless profile (§10.3).
- **Web UI not observed.** Plugin Manager inventory card, locale rendering, icon, and the
  `meta.detail` document pane were not exercised.
- **The acceptance run used the same plugin code via a `--patch` overlay, not the installed bundle
  path.** Bundle anchoring/install composition is covered separately by the offline installability
  tests and the live Desktop install (§10.1); the headless run proves end-to-end model behavior of
  the plugin itself.
- **Model behavior was sampled once** (one model route, one prompt, one session). It is evidence
  that the bootstrap triggers the skill, not a statistical claim about trigger rates.
- **Delegated gating tests use fake agent objects** shaped `{session:{header:{delegationDepth}}}`
  and `{options:{subagentDepth}}`. The real shapes were confirmed in runtime source
  (`dsh-agent-loop` `assembleContextFor`, `dsh-subagent` `childSessionMeta`), but no real child agent
  was driven through a loop in the offline suite.
- **Upstream skill behavior is assumed from byte identity**; the port intentionally does not test
  the skills' own workflows.
- **Single platform / single Node version**: macOS 27.0.1, Node v26.12.1. Windows path/file-URL
  anchoring was not exercised.
- **Tests are not shipped** (`files` excludes `tests/`); a published tarball cannot be re-verified
  with this suite.
- Version-exemption/compatibility resolution (`evaluatePluginCompatibility`) was not exercised; the
  package declares no `engines`/peer dependencies, so compatibility checks should be trivial.
- **The Desktop profile now carries the bundle, enabled.** That is a live state change made during
  verification (Lead's decision); the `remove_bundle`/uninstall path was not exercised.

## 8. Acceptance test plan — brainstorming fires on a fresh top-level session

Target behavior: a fresh top-level session prompted with exactly `Let's make a react todo list`
uses the `brainstorming` skill before any implementation work, because DESIGN goal 2 puts
`using-superpowers` in the system prompt with no per-session opt-in.

### Preconditions

1. The bundle is installed in a **dedicated verification profile** (not the live development
   profile) via `plugin_manager install_bundle` with the absolute package directory; DSH restarted
   (or HMR applied) and the profile confirms the new plugin row.
2. Model/provider configured and able to emit tool calls; workspace is an empty directory
   (e.g. `/tmp/superpowers-acceptance`).
3. No existing session for that workspace, so the session is genuinely fresh and top-level.

### Procedure

1. Note `$DSH_HOME` (default `~/.dsh`) and the workspace session key
   (`--<cwd-with-separators-as-dashes>--`).
2. Start a new top-level session in the verification profile; send exactly:
   `Let's make a react todo list`.
3. Record the assistant's first steps and tool calls; do not intervene.
4. Evidence extraction (once the session has run):
   - Locate `$DSH_HOME/sessions/<project-key>/<session-id>/session.v4.jsonl.zstd`.
   - `zstd -dc <file> | grep -c "You have superpowers."` → **1** (rendered system prompt present,
     once).
   - `zstd -dc <file> | grep -c "<EXTREMELY_IMPORTANT>"` → **1**.
   - Find the `skill` tool call: `name: "brainstorming"` with a `<skill_instructions>` result whose
     content has no `---` frontmatter block and whose `<skill_resources>` base directory is the
     installed package's `skills/brainstorming` directory.
   - Confirm no `skill` call with `name: "using-superpowers"` (the already-loaded note is honored).
   - Confirm assistant prose announces using the skill and asks design/clarifying questions before
     writing files/running build commands.

### Pass criteria

- [ ] Bootstrap marker appears exactly once in the rendered system prompt of the fresh top-level
      session.
- [ ] `brainstorming` loads before any `write`/`edit`/`bash` implementation step.
- [ ] Loaded skill content is frontmatter-free and `resourceBase` is the packaged skill directory
      (not the workspace).
- [ ] No reload of `using-superpowers`.
- [ ] The tool mapping is present in the bootstrap (the `dsh-tools.md` text appears after the skill
      body in the rendered prompt).

### Negative controls

- **Delegated session.** From the same top-level session dispatch one `subagent` whose whole prompt
  is: "State verbatim whether the exact line `You have superpowers.` appears in your system prompt;
  do not call any skill." Inspect the child session's transcript: the marker must **not** appear
  (delegation depth > 0). The child's skill catalog must still contain the 15 skills if it does call
  `skill`.
- **Baseline profile.** Run the same prompt in a profile without the bundle: no bootstrap marker and
  no `provider: superpowers` catalog rows; the model should not claim to use a `brainstorming`
  skill.
- **Cost check.** Compare rendered system-prompt byte length with and without the bundle; the delta
  should be 13,218 B. A much larger delta means skill bodies leaked into the prompt.

### Cleanup

`plugin_manager remove_bundle` for the verification profile; start a fresh session and confirm the
marker is gone. Do not leave the bundle installed in the live development profile.

## 9. Porting Definition of Done assessment

| DoD item | Verified by | Result |
|---|---|---|
| Skills catalog + loadable | verifier suite (real runtime) + live Desktop session | **Met.** 15/15 catalogued, sorted, loadable through the real `SkillRegistry`; definitions pass runtime validation; bodies frontmatter-free; `renderSkillContent` path verified. Live Desktop: catalog gained the 15 skills and `skill({name:"verification-before-completion"})` returned the correct `<skill_content>` and base directory (§10.2). |
| Bootstrap injection for top-level sessions | verifier suite (assembly level) + live Desktop session + headless acceptance | **Met.** Full bootstrap assembled for root / missing agent with `interpolate: false`, one tag pair, mapping last. Live Desktop prompt grew 7,642 → 20,818 chars (delta 13,176 = composed 13,174 chars + 2-char separator, §10.2); headless fresh top-level session carried the bootstrap and invoked the skill (§10.3). |
| Delegated suppression | verifier suite (assembly level) | **Met at assembly level.** Empty section and rendered-prompt omission for header depths 1/2 and `AgentOptions.subagentDepth: 1`. No live delegated-child negative control (noted in §7). |
| Installable patch anchor | verifier suite (`dsh-app-boot`) + live `plugin_manager install_bundle` | **Met.** `./lib/index.js` anchors beside the patch; simulated profile composes the row; Plugin Manager metadata resolves via exports. Live install applied with `application: "applied"`, empty `warnings`, and a `link:` dependency in the Desktop profile (§10.1). |
| Manifest / display metadata | verifier suite | **Met.** `package.json`, locale en+zh (+`meta.detail` targets), 36×36 SVG icon 315 B, packed `files` include both licenses/READMEs/DETAIL docs and exclude tests. |
| Content parity | verifier suite (`diff -r` and byte compare) | **Met.** Exactly one added file plus one inserted SKILL.md line; all other 79 shared files byte-identical; reference checkout pinned and clean; re-run after the live work is unchanged. |
| Test suite | verifier | **Met.** 105/105 pass in 21 suites; skips cleanly (84/84 pass) when the runtime is absent; re-run after live work is 105/105. |
| Live `plugin_manager install_bundle` + headless acceptance run | Lead, independently re-checked by verifier (§10) | **Met.** Install result `application: "applied"`, no warnings, version 1.0.0; profile state and live session logs re-checked on disk; archived headless session re-parsed (fresh top-level session, brainstorming invoked before any code). |

No remaining DoD gates. Residual (non-blocking) limits: no live delegated-child negative control,
Desktop fresh-session evidence is a mid-session prompt update, Web UI inventory rendering not
observed, and a single model/route sample — see §7.

## 10. Live gates (Lead) — record and independent re-check

The Lead executed the live gates on 2026-11-08. The facts below are the Lead's record; the verifier
independently re-read the profile state, the running Desktop session log, and the archived headless
session log afterwards. Details are in `docs/ACCEPTANCE.md` (Lead-owned); this section records what
was confirmed for verification purposes.

### 10.1 Desktop install via `plugin_manager`

- Call and result:

  ```text
  plugin_manager action=install_bundle target=/Users/grainrain/Developer/GitHub/dsh-superpowers
  -> {"stage":"enable","target":"@local/dsh-superpowers","enabled":true,"changed":true,
      "application":"applied","warnings":[],"bundle":"@local/dsh-superpowers","version":"1.0.0"}
  ```

  pnpm added a `link:` dependency; no build scripts ran; no warnings.
- Independent state check: `~/.dsh/profiles/desktop/package.json` declares
  `"@local/dsh-superpowers": "link:/Users/grainrain/Developer/GitHub/dsh-superpowers"` and lists
  the bundle last in `dsh.profile.bundles`;
  `~/.dsh/profiles/desktop/node_modules/@local/dsh-superpowers` is a symlink whose realpath is the
  package directory; the profile's own patch file contains no `superpowers` row, i.e. the row comes
  from the bundle patch layer as designed.
- The bundle remains installed and enabled after verification (Lead's cleanup decision).

### 10.2 Live Desktop behavior

- **Catalog:** the running Desktop session's skill catalog gained the 15 packaged skills immediately
  after install (e.g. `brainstorming`, `verification-before-completion`).
- **Live skill load:** Desktop session `session-67f2f4ab-a75d-4ac2-bad0-9d07a9ccb4b8`
  (cwd `/Users/grainrain/Developer/AgentHome`, `delegationDepth: 0`): tool call seq 1446
  `skill({"name":"verification-before-completion"})`; tool result seq 1448 begins
  `<skill_content name="verification-before-completion">` with
  `Base directory for this skill: /Users/grainrain/Developer/GitHub/dsh-superpowers/skills/verification-before-completion`,
  and contains no frontmatter. This is live provider + `resourceBase` evidence in the installed
  profile.
- **Live system-prompt injection:** the same session log has exactly two `system/message` events:

  | seq | turn/step | chars | contains `You have superpowers.` | contains DSH tool mapping |
  |---|---|---|---|---|
  | 13 | 1/1 | 7,642 | no | no |
  | 1442 | 1/125 | 20,818 | yes | yes |

  The delta is 13,176 chars = the composed bootstrap's 13,174 characters plus the renderer's
  2-character section separator. The injected text is therefore exactly the measured bootstrap, not
  merely an approximation.

### 10.3 Headless acceptance run

- Environment: temporary `superpowers-e2e` profile initialized from the shipped `headless` template
  (no GUI, does not carry this bundle) plus a single `--patch` overlay inserting only the
  `superpowers` row at the checkout's `lib/index.js` — i.e. the same plugin code the bundle
  installs, with no per-session opt-in. Empty temporary workspace; API-key route via the launch
  environment.
- Session `session-7020bb7e-bd44-4de4-9ebb-92af8bf3b6fc`, header `delegationDepth: 0`; archived
  verbatim at `docs/evidence/acceptance-headless-session.v4.jsonl.zstd` (36,349 B zstd; 37 records
  when decompressed).
- Independent parse of the archive:
  - exactly one `system/message` (seq 7, 15,767 chars) containing `You have superpowers.` and
    `DeepSeek Harness (dsh) Tool Mapping`;
  - first assistant text: `I'll start with the brainstorming skill since this is new feature work.`;
  - first tool call seq 20 `skill({"name":"brainstorming"})`; tool result seq 21 (15,308 chars)
    begins `<skill_content name="brainstorming">` with
    `Base directory for this skill: …/dsh-superpowers/skills/brainstorming` and no frontmatter;
  - the only other tool call is a `bash` directory listing (recon);
  - no `write`, `edit`, or `apply_patch` calls anywhere;
  - the final assistant answer (740 chars) has brainstorming's prescribed first-message shape
    (names the project shape, asks the open "why" question, offers to dive in).
- Exit code 0. The temporary profile and headless session were removed afterwards; the session log
  is retained in this package as evidence.

### 10.4 Re-run after the live work

- The package tree changed only by `docs/ACCEPTANCE.md`, `docs/evidence/…`, and DESIGN/README
  wording. `node --test tests/` re-run by the verifier: **105/105 pass, 21 suites, 0 fail**.
- `diff -r superpowers-ref/skills dsh-superpowers/skills` re-run: unchanged — only the one inserted
  `using-superpowers/SKILL.md` line plus the one added `dsh-tools.md`.
- New defects found in this pass: **none**.
