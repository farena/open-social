---
title: Business context store
type: entity
code_refs: [src/lib/business-context.ts, src/types/business-context.ts, src/app/api/business-context/route.ts, src/app/business-context/page.tsx, src/components/business-context/BusinessContextChat.tsx, src/components/business-context/BusinessContextView.tsx, src/lib/context-chat-system-prompt.ts]
sources: []
related: [pages/entities/chat-route.md]
created: 2026-04-29
updated: 2026-04-29
confidence: medium
---

# Business context store

A persisted business profile (mission, audience, voice, products, etc.) injected into every system prompt that needs it. Decoupled from `brand` so the visual identity (`brand`) and the business narrative (`businessContext`) can evolve separately.

## Storage

- File: `data/business-context.json`.
- Lib: `src/lib/business-context.ts` exposes `getBusinessContext()` and `setBusinessContext(patch)` over the standard `data.ts` mutex pattern.

## API

`GET /api/business-context` returns the current value; `PUT` replaces it. There's no PATCH — the surface is small enough that the client always sends the full document.

## UI

`/business-context` (`src/app/business-context/page.tsx`) shows a side-by-side view + chat. The chat uses the `context` mode of [[entities/chat-route]], whose system prompt (`src/lib/context-chat-system-prompt.ts`) instructs the agent to incrementally fill the document by calling `PUT /api/business-context`.

## Where it's read

- `buildContentGenerationSystemPrompt` (the [[entities/generate-route]] prompt builder) — fetched in parallel with `brand`.
- Other chat modes inject it as needed.

## Recent changes

- 2026-04-21 (`3df2fd1`) — Initial implementation.
