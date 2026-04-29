---
title: Append-only agent contract during generation
type: concept
code_refs: [src/app/api/content/[id]/slides/[slideId]/route.ts, src/lib/content-generation-system-prompt.ts]
sources: [raw/decisions/append-only-agent-contract-2026-04-26.md]
related: [pages/entities/generate-route.md, pages/entities/content-routes.md, pages/entities/content-item-model.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Append-only agent contract

Invariant: while a `ContentItem` is in `state: "generating"`, the Claude agent may **only** POST new slides. PUT and DELETE on slides return `409 Conflict` for the agent. User edits (no `X-Agent-Origin` header) are always permitted.

## Why

Generation is non-blocking by design (the user opens the editor immediately and slides stream in). If the agent could rewrite or delete slides, it would race with concurrent user edits and there is no merge story. By restricting the agent to append-only, every concurrent state is well-defined: the user owns slides 1..N, the agent appends N+1.

## How it's enforced

- **Server**: `src/app/api/content/[id]/slides/[slideId]/route.ts` checks `request.headers.get("X-Agent-Origin") === "claude"` and `item.state === "generating"`. PUT/DELETE return 409 in that case.
- **Agent**: the system prompt (`src/lib/content-generation-system-prompt.ts`) tells the agent to send the header on every write, POST only, and treat 409 as a hard stop (no retries, no fallback to PUT).
- **Trust boundary**: there is no real auth — the header is a soft signal that works because the agent runs as a local subprocess spawned by [[entities/generate-route]]. A future remote agent will need a real auth mechanism.

## Related guarantees

- The state flip to `"generating"` happens *before* the spawn (see [[entities/generate-route]]), so the contract is in force from the moment the agent has any way to make a request.
- On non-zero exit, state is *not* flipped back to `"idea"`. The item stays `"generating"` until something explicitly resets it (Task 8 retry path, future).
