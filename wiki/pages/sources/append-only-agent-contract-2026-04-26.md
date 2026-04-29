---
title: Source — Append-only agent contract during generation
type: source
code_refs: [src/app/api/content/[id]/slides/[slideId]/route.ts, src/lib/content-generation-system-prompt.ts, src/app/api/content/[id]/generate/route.ts]
sources: [raw/decisions/append-only-agent-contract-2026-04-26.md]
related: [pages/concepts/append-only-agent-contract.md, pages/entities/generate-route.md, pages/entities/content-routes.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Source — Append-only agent contract (2026-04-26)

## What it changes

While `ContentItem.state === "generating"`, the server rejects PUT/DELETE on slides from the agent (identified by `X-Agent-Origin: claude`) with `409 Conflict`. The agent may only POST new slides. User edits (no header) are unaffected.

## Pages affected

- [[concepts/append-only-agent-contract]] — the invariant itself.
- [[entities/generate-route]] — emits the SSE that drives the streaming UI; relies on this contract for safety.
- [[entities/content-routes]] — `/api/content/[id]/slides/[slideId]` enforces the 409.

## Key claims (with citations)

- The header is `X-Agent-Origin: claude` and the trigger state is `generating` (see `src/app/api/content/[id]/slides/[slideId]/route.ts`).
- The agent system prompt instructs POST-only and "treat 409 as a hard stop" (see `src/lib/content-generation-system-prompt.ts`).
- There is no per-request auth — trust comes from the agent being a local subprocess. Future remote agents will need a real auth signal.

See raw: `wiki/raw/decisions/append-only-agent-contract-2026-04-26.md`.
