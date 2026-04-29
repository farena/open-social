---
origin: commit 451e577 ("chore: rebrand Open Carrusel → Open Social")
date: 2026-04-26
related_code: package.json, README.md, CLAUDE.md, src/app/layout.tsx, src/app/page.tsx, src/components/layout/TopBar.tsx, src/lib/chat-system-prompt.ts, src/lib/context-chat-system-prompt.ts
---

# Decision — Rebrand Open Carrusel → Open Social

## Context

The product was scoped to Instagram carousels at inception, hence "Open Carrusel". The pivot to a unified `ContentItem` model (see [[carousel-to-content-item-pivot-2026-04-26]]) opens the door to single posts and stories — keeping a carousel-only name in the UI and prompts would mislead both users and the agent.

## Decision

Rename the product to **Open Social**. The carousel as a *type* survives (`ContentItemType: "carousel"`), but the surface no longer privileges it. The rebrand is purely a string swap — no behavioral change, no schema change.

## Alternatives considered

- Keep "Open Carrusel" and lean into multi-format internally — rejected, the prompt-injected name leaks into the chat surface and would confuse the agent's framing of stories/posts.

## Outcome

Shipped in commit `451e577`. Subsequent prompt rewrites (`9fb98ff`) reinforce the new framing.
