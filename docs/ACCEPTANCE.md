# Live acceptance evidence

The Porting Definition of Done requires that, in a clean top-level session, the
user message

> Let's make a react todo list

auto-triggers the `brainstorming` skill before any code is written. This page
records the acceptance run for this port, executed on 2026-11-08.

## Environment

- DSH `0.2.2-rc.1`, Desktop installation runtime CLI
  (`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`).
- Profile: `superpowers-e2e`, initialized from the shipped `headless` template
  (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`, no GUI), which does
  not carry this bundle.
- Overlay: a single `--patch` file inserting only the plugin row
  (`- insert: [{ id: superpowers, name: '<checkout>/lib/index.js' }]`), i.e. the
  exact plugin the bundle installs. No other composition change.
- Credential: API-key route via the launch environment (headless profiles use
  the launch environment / `.env`, not the managed store).
- Workspace: an empty temporary directory.

## Result

Session `session-7020bb7e-bd44-4de4-9ebb-92af8bf3b6fc`
(header `delegationDepth: 0`), archived verbatim at
[docs/evidence/acceptance-headless-session.v4.jsonl.zstd](evidence/acceptance-headless-session.v4.jsonl.zstd)
(zstd-compressed session JSONL; read with `zstd -dc`).

1. **Bootstrap injected.** The first `system/message` event is 15,767
   characters and contains `You have superpowers.` and the DSH tool mapping
   block. The base headless prompt is ~2.5 KiB, so this is the 13,218-byte
   composed bootstrap plus first-party text.
2. **Skill invoked before any code.** The assistant's first text is
   "I'll start with the brainstorming skill since this is new feature work.",
   followed by tool call `skill({"name": "brainstorming"})`.
3. **Skill content and resources correct.** The tool result (15,308 chars)
   begins with `<skill_content name="brainstorming">` and reports
   `Base directory for this skill: <checkout>/skills/brainstorming`, then the
   upstream body.
4. **No implementation before design.** The only other tool call is a
   `bash` directory listing (recon); there are no `write`/`edit`/`apply_patch`
   calls. The final answer is the brainstorming skill's prescribed first
   message: it names what the project would be, asks the one open question
   ("why do you want it?"), and offers the user the option to just dive in.
5. Exit code 0, final answer printed on stdout.

This is DoD items 1–4 of the upstream porting guide (bootstrap loads with no
per-session opt-in; tool mapping present; skills invocable; acceptance test
passes) on a real model, real runtime, and the same plugin code the bundle
installs.

## Negative control (offline)

Delegated sessions must not receive the bootstrap. This is covered by
`tests/integration-cordis.test.mjs` with the real `SystemPrompt` service:
`assemble({ agent })` returns no section text for delegation depths 1 and 2 and
for `AgentOptions.subagentDepth`, and returns the full bootstrap for a
top-level agent. A live delegated child was not run in the headless profile; the
assembly-level assertion plus the platform's own `delegationDepthOf()` signal
are the evidence for this behavior.

## Live install into the Desktop profile

After the headless acceptance above, the bundle was installed into the live
`desktop` profile with the Harness's own plugin manager:

```text
plugin_manager action=install_bundle target=/Users/grainrain/Developer/GitHub/dsh-superpowers
-> {"stage":"enable","target":"@local/dsh-superpowers","enabled":true,"changed":true,
    "application":"applied","warnings":[],"bundle":"@local/dsh-superpowers","version":"1.0.0"}
```

Observed state after installation (2026-11-08):

- Profile manifest gained `"@local/dsh-superpowers": "link:/Users/grainrain/Developer/GitHub/dsh-superpowers"`
  and the bundle in `dsh.profile.bundles`; the package is symlinked into the
  profile's `node_modules`.
- The plugin row `superpowers` appears in the live tree with `enabled: true`,
  `fiberPhase: "active"`, module
  `file:///Users/grainrain/.dsh/profiles/desktop/node_modules/@local/dsh-superpowers/lib/index.js`.
- The running session's skill catalog updated immediately with all 15
  Superpowers skills, and `skill({name:"verification-before-completion"})`
  returned `<skill_content>` with
  `Base directory for this skill: …/dsh-superpowers/skills/verification-before-completion`,
  verifying the live provider and its `resourceBase` in the installed profile.
- The running session's system prompt gained a second prompt version: the
  pre-install `system/message` was 7,642 chars (seq 13, turn 1 step 1); the
  post-install one is 20,818 chars (seq 1442, turn 1 step 125) and contains
  `You have superpowers.` and the DSH tool mapping. This is direct evidence of
  live system-prompt injection in the Desktop profile, not merely a mounted
  bundle.

The plugin was installed once and left enabled. Uninstall path (not exercised
in this run): `plugin_manager action=remove_bundle target=@local/dsh-superpowers`.

## Cleanup

The temporary `superpowers-e2e` profile and the headless test session were
removed after the evidence above was archived; the headless session log is
preserved in this package. The Desktop install remains enabled.

## Reproduce

```bash
cat > /tmp/sp-e2e.patch.yml <<EOF
- insert:
    - id: superpowers
      name: '<checkout>/lib/index.js'
EOF
dsh --profile headless --patch /tmp/sp-e2e.patch.yml "Let's make a react todo list"
```

(`headless` auto-initializes from the shipped template. Point the patch at a
checkout; if the profile already carries the bundle, no patch is needed.)
