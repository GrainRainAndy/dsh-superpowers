---
description: "Give every DSH session the Superpowers software-development skills and the using-superpowers bootstrap, mapped to DSH tools."
kind: "package-bundle"
---

# @local/dsh-superpowers

English | [中文](README.zh.md)

## Summary

A DeepSeek Harness port of [Superpowers](https://github.com/obra/superpowers). The package ships the 15 Superpowers skills unchanged, registers them in the session skill catalog, and injects the `using-superpowers` bootstrap plus a DSH tool mapping into the system prompt of every top-level session. No per-session opt-in: install the bundle and the next session starts with Superpowers active.

Repository: <https://github.com/GrainRainAndy/dsh-superpowers>

## Branches

- `main` — release line: the installable bundle (runtime code, upstream skills, user docs, licenses).
- `dev` — development line: `main` plus the test suite and the engineering record (`docs/DESIGN.md`, `docs/VERIFICATION.md`, `docs/ACCEPTANCE.md`, `docs/evidence/`).

Install from `main`; develop the plugin on `dev`.

## What the agent gets

- **Skills in the catalog.** All 15 skills appear as bare names (`brainstorming`, `writing-plans`, `test-driven-development`, `subagent-driven-development`, …). The model loads one with the `skill` tool; a user can also invoke one with `/brainstorming`. Skill bodies stay upstream-verbatim; supporting files (`references/`, `scripts/`, prompt templates) are read on demand through the skill's base directory.
- **A session-start bootstrap.** `skills/using-superpowers/SKILL.md` (frontmatter removed) plus `skills/using-superpowers/references/dsh-tools.md` are composed into one `<EXTREMELY_IMPORTANT>` system-prompt section at order 6000. That is what makes the model check for a relevant skill before acting.
- **A DSH tool mapping.** The routing from Superpowers' action vocabulary to real DSH tools: `skill`, `subagent` / `subagent_fork` / `send_message` / `list_agents`, `todo_write`, `read` / `write` / `edit` / `glob` / `grep` / `bash`, `ask_user_question`, `exit_plan_mode`, `web_search` / `web_fetch`, plus DSH-specific facts (skill roots, session transcript paths, no native worktree tool).
- **No subagent noise.** Delegated sessions (delegation depth > 0) do not receive the bootstrap, matching the fresh-context workers Superpowers' subagent skills assume. Skills stay registered, so a worker can still load one when its dispatch prompt says to.

The 15 skills:

| Skill | Use when |
|---|---|
| `brainstorming` | before any creative work: features, components, behavior changes, plans |
| `writing-plans` | turning an approved spec into a bite-sized implementation plan |
| `executing-plans` | executing a plan inline without subagents |
| `subagent-driven-development` | executing a plan with fresh implementer and reviewer subagents |
| `dispatching-parallel-agents` | 2+ independent tasks that can run concurrently |
| `test-driven-development` | implementing any feature or bugfix, red/green |
| `systematic-debugging` | any bug, test failure, or unexpected behavior |
| `verification-before-completion` | before claiming work is complete, fixed, or passing |
| `requesting-code-review` | completing tasks or major features, before merging |
| `receiving-code-review` | evaluating review feedback before implementing it |
| `using-git-worktrees` | starting work that needs workspace isolation |
| `finishing-a-development-branch` | when implementation and tests are done, deciding how to integrate |
| `writing-skills` | creating or editing skills |
| `diagnosing-superpowers` | a session went wrong and you need evidence for why |
| `using-superpowers` | the bootstrap itself (already in context; do not reload) |

## Install

The plugin is a DSH profile bundle. Install it into the profile whose sessions should get it, using the Harness's plugin manager:

```text
plugin_manager action=install_bundle target=git+https://github.com/GrainRainAndy/dsh-superpowers.git
```

For local development, pass an absolute checkout path instead (e.g. `target=/path/to/dsh-superpowers`); pnpm then links the checkout instead of copying it, so skill edits are picked up on the next load.

In the Web GUI the same action is available from **Plugins** (install a package by spec) and from **Settings → Plugins**. Installation selects the `@local/dsh-superpowers` bundle layer and applies it live on profile-aware surfaces. After installation the plugin row is `superpowers` (bundle patch `cordis.patch.yml`, plugin entry `./lib/index.js`).

## Verify

- In the current session, load a skill: call `skill` with `name: "brainstorming"` — the full body should return inside `<skill_content>`.
- In a **new** session (start a new chat), ask `what are your superpowers?` — the answer should reflect the injected bootstrap.
- Acceptance test: in a new session, send `Let's make a react todo list`. A working install starts the `brainstorming` skill (design questions) instead of writing code.

## Update, disable, remove

- **From a git install:** update the release line, then `remove_bundle` and install the new spec again. Replacing an installed package needs a Host restart to load fresh JavaScript.
- **From a local checkout:** skill content edits (`skills/`) take effect on the next skill load; plugin code edits (`lib/`) need a Host restart. Because the profile links the checkout, do not move or delete it while the bundle is installed.
- **Disable** without uninstalling: `plugin_manager action=set_bundle target=@local/dsh-superpowers enabled=false` (or the Plugins page switch).
- **Remove**: `plugin_manager action=remove_bundle target=@local/dsh-superpowers`.

## How it works

`cordis.patch.yml` inserts one Host plugin row whose `name` is `./lib/index.js`; the loader anchors inserted relative paths beside the patch file, so the bundle and the plugin are one package. `lib/index.js`:

1. registers a skill provider (`ctx.skills.registerProvider`) that discovers `skills/*/SKILL.md`, exposes bare-name candidates at bundled rank 600 with a directory `resourceBase`, and reads a body lazily on `get`;
2. reads `skills/using-superpowers/SKILL.md` and `skills/using-superpowers/references/dsh-tools.md` once and registers a system-prompt section (`superpowers:bootstrap`, order 6000, `interpolate: false`) whose text is the bootstrap, or the empty string for delegated agents.

Details and contracts: [docs/DETAIL.md](docs/DETAIL.md). The engineering record (design contract, verification, live acceptance) lives on the `dev` branch.

## Requirements

- A DSH profile that mounts the `skills` and `systemPrompt` services (any `@deepseek-ai/dsh-base` composition) and a model-invocable `skill` tool (`@deepseek-ai/dsh-tool-skill`).
- No package dependencies, no install scripts, no build step. Node builtins only.
- Tested against DSH `0.2.2-rc.1`.

## Limitations

- **Prompt budget.** Per-session cost is a 13,218-byte bootstrap in the system prompt (using-superpowers body 3,042 B + DSH tool mapping 9,889 B + wrapper), plus ~3 KiB of catalog descriptions. Skill bodies load on demand. If that is too much for a deployment, disable the bundle or trim the mapping in the checkout (re-measure with the plugin's own composition).
- **Delegated sessions are excluded by design.** A subagent that needs Superpowers guidance must be told to load the skill explicitly in its dispatch prompt.
- **Profile-specific tool paths.** The mapping documents tools conditionally: `wait_agent` and Team tools exist only where the profile mounts them; the mapping routes continuable workers through `spawn_teammate` + `send_message` in Agent-Teams profiles instead of plain subagent ids.
- **No native worktree tool** in the standard tool set; `using-git-worktrees` uses its git fallback through `bash`.
- **Visual companion** (brainstorming's optional browser companion) runs its own Node server through `bash` background jobs; it needs a local port and a browser and is the user's choice.
- **No dedicated UI.** The capability is model-facing; the Plugins inventory shows only this bundle's title, description, and icon.

## Verification

The `dev` branch carries `node --test` suites covering frontmatter parsing, catalog contents, bootstrap composition and delegation gating, manifest and display metadata, patch anchoring, and upstream content parity, plus the full verification record (`docs/VERIFICATION.md`, `docs/ACCEPTANCE.md`) and the archived acceptance session. The Cordis integration test mounts the real `@deepseek-ai/dsh-skill` and `@deepseek-ai/dsh-system-prompt` services from an installed DSH runtime.

```bash
git clone -b dev https://github.com/GrainRainAndy/dsh-superpowers.git
cd dsh-superpowers
node --test tests/
```

Set `DSH_RUNTIME_ROOT` to an extracted DSH runtime and `SUPERPOWERS_REF_ROOT` to a pinned `obra/superpowers` checkout to run the integration and parity suites; suites skip with an explicit message when either is absent.

## Attribution and license

Superpowers is © 2025 Jesse Vincent, MIT licensed, pinned at v7.0.2
(commit `22f0b463e7a5e579904dd6211a520321035526f7`). The `skills/` tree is
copied verbatim; the only modifications are the added
`skills/using-superpowers/references/dsh-tools.md` and one line in
`skills/using-superpowers/SKILL.md`'s Platform Adaptation list. This package's
own code is MIT licensed. See [NOTICE.md](NOTICE.md),
[LICENSE](LICENSE), and [LICENSE-superpowers](LICENSE-superpowers).
