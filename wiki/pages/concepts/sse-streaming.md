---
title: SSE streaming pattern
type: concept
code_refs: [src/app/api/chat/route.ts, src/app/api/content/[id]/generate/route.ts, src/lib/use-chat-stream.ts, src/app/content/[id]/page.tsx]
sources: [raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/chat-route.md, pages/entities/generate-route.md]
created: 2026-04-29
updated: 2026-05-01
confidence: high
---

# SSE streaming pattern

How the Claude CLI subprocess talks to the browser. Used by both [[entities/chat-route]] (`/api/chat`) and [[entities/generate-route]] (`/api/content/[id]/generate`).

## Server side

1. Spawn the Claude CLI with `--output-format stream-json --include-partial-messages --verbose`. Each line on stdout is one JSON event.
2. Wrap the response in a `ReadableStream` with `Content-Type: text/event-stream`.
3. Buffer stdout, split on `\n`, parse each line as JSON, translate to SSE frames:
   - `data: { type: "token", text: "..." }\n\n` for streaming text.
   - `data: { type: "result", text: "..." }\n\n` for the final result.
   - `data: { type: "tool_use", ... }` and `data: { type: "tool_result", ... }` for tool deltas (chat route only — see [[entities/chat-route]]).
   - `event: error\ndata: { error, code, ... }\n\n` for any failure.
   - `event: done\ndata: { ... }\n\n` always emitted on close.
4. Buffer stderr capped at 8 KB and include in any error event payload.
5. `cancel()` on the stream aborts the subprocess via `AbortController`.

## Client side

Two consumers, both `fetch` + `ReadableStream` (not `EventSource`, which can't POST):

- **`src/lib/use-chat-stream.ts`** — the chat hook. Parses the SSE line protocol manually and exposes `messages`, `streamingText`, `toolUses`, and a `send(input)` callable to React components.
- **`src/app/content/[id]/page.tsx` → `consumeGenerationStream`** — the content page reads the SSE body of `POST /api/content/[id]/generate` and uses each event as a "something changed" pulse, throttling `GET /api/content/[id]` refetches to ≥600 ms gaps. A 1500 ms fallback poll runs only when the page lands on `state === "generating"` without an active stream (e.g. user reloaded mid-generation, since the original POST belongs to a previous lifecycle). Replaces the previous fixed-interval 800 ms polling.

## Invariants

- **Failure must be a payload, not silence.** A stream that closes without an `event: error` is indistinguishable from a fast success on the client. Every catch block must emit `event: error` before closing. See [[sources/windows-claude-cli-silent-failure-2026-04-15]].
- **stderr is bounded.** Cap at 8 KB to avoid unbounded memory if the CLI is chatty.
- **Always emit `event: done`.** The client uses it to flip "streaming" off and re-enable inputs.

## Recent changes

- 2026-05-01 (`c552e67`) — Content page now consumes the generate-route SSE body directly (throttled refetches) instead of fixed-interval polling.
