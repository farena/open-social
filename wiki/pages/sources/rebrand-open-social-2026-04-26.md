---
title: Source — Rebrand Open Carrusel → Open Social
type: source
code_refs: [package.json, README.md, CLAUDE.md, src/app/layout.tsx, src/components/layout/TopBar.tsx]
sources: [raw/decisions/rebrand-open-social-2026-04-26.md]
related: []
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Source — Rebrand to Open Social (2026-04-26)

## What it changes

String swap across UI, prompts, README, and `package.json`. No behavioral or schema change.

## Why it matters for the wiki

The product name leaks into the system prompts (`src/lib/chat-system-prompt.ts`, `src/lib/context-chat-system-prompt.ts`) so the agent's framing of "what we're building" is keyed to it. Future agent-prompt edits should use "Open Social", not "Open Carrusel".

See raw: `wiki/raw/decisions/rebrand-open-social-2026-04-26.md`.
