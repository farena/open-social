---
title: Source — Windows Claude CLI silent failure
type: source
code_refs: [src/lib/claude-path.ts, src/app/api/chat/route.ts, "src/app/api/content/[id]/generate/route.ts"]
sources: [raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/chat-route.md, pages/entities/generate-route.md, pages/concepts/sse-streaming.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Source — Windows Claude CLI silent failure (2026-04-15)

## What happened

The chat agent never produced output on Windows. Two issues compounded: `getClaudePath()` did not search Windows install locations, and Node's built-in `spawn` mangled multi-line argv passed to a `.cmd` shim. Both failures were swallowed (no SSE error event) so the UI looked frozen.

## Pages affected

- [[entities/chat-route]] — defensive pattern: `cross-spawn` for `.cmd` shims, capped stderr buffering, SSE `event: error` on failure.
- [[entities/generate-route]] — inherits the same pattern.
- [[concepts/sse-streaming]] — invariant: failures must surface as `event: error`, not silent stream close.

## Key claims (with citations)

- `getClaudePath()` searches `%APPDATA%\npm\claude.cmd`, `%LOCALAPPDATA%`, then falls back to `where claude` on Windows (see `src/lib/claude-path.ts`).
- The chat and generate routes detect `.cmd`/`.bat` shims and switch to `cross-spawn` (see `src/app/api/content/[id]/generate/route.ts:88`).
- stderr is buffered with an 8 KB cap and emitted in the SSE `error` event payload (see `src/app/api/content/[id]/generate/route.ts:140`).

See raw: `wiki/raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md`.
