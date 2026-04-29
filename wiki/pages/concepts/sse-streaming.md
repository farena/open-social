---
title: SSE streaming pattern
type: concept
code_refs: [src/app/api/chat/route.ts, src/app/api/content/[id]/generate/route.ts, src/lib/use-chat-stream.ts]
sources: [raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/chat-route.md, pages/entities/generate-route.md]
created: 2026-04-29
updated: 2026-04-29
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

`src/lib/use-chat-stream.ts` is the consolidated client. It uses `fetch` + `ReadableStream` (not `EventSource`, which can't POST), parses the SSE line protocol manually, and exposes `messages`, `streamingText`, `toolUses`, and a `send(input)` callable to React components.

## Invariants

- **Failure must be a payload, not silence.** A stream that closes without an `event: error` is indistinguishable from a fast success on the client. Every catch block must emit `event: error` before closing. See [[sources/windows-claude-cli-silent-failure-2026-04-15]].
- **stderr is bounded.** Cap at 8 KB to avoid unbounded memory if the CLI is chatty.
- **Always emit `event: done`.** The client uses it to flip "streaming" off and re-enable inputs.
