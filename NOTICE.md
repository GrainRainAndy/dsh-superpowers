# Notice

This package bundles skill content and behavior-shaping instructions from
**Superpowers**, and adds a DeepSeek Harness port layer.

## Upstream

- Project: Superpowers — <https://github.com/obra/superpowers>
- Copyright: Copyright (c) 2025 Jesse Vincent
- License: MIT (full text: `LICENSE-superpowers`)
- Pinned version: v7.0.2, commit `22f0b463e7a5e579904dd6211a520321035526f7`
  (2026-11-03)
- What is copied: the complete `skills/` tree (15 skill directories, 80 files,
  including reference documents, prompt templates, and helper scripts).

## Additions and modifications (this port)

1. New file `skills/using-superpowers/references/dsh-tools.md` — the DSH tool
   mapping required by the upstream porting guide. It translates the skills'
   harness-neutral action vocabulary (`Skill`, `Task`, `TodoWrite`, `Read`,
   `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebFetch`, plan mode, …) into real
   DSH tools and documents DSH-specific facts (skill roots, session transcript
   locations, subagent lifecycle).
2. One added line in `skills/using-superpowers/SKILL.md`, under
   "Platform Adaptation": `- DeepSeek Harness (dsh): \`references/dsh-tools.md\``.
   No other upstream skill body is edited; the porting guide requires the
   action vocabulary in skill bodies to stay harness-neutral.
3. New code under `lib/`, package metadata, locale resources, and the icon.

## License scope

`LICENSE` covers the port code and metadata written for this package. The
copied skill content remains under the upstream MIT license; see
`LICENSE-superpowers` for its full text and copyright notice. Redistribution of
this package must retain both licenses.

The icon (`icon.svg`) is an original drawing created for this package.
