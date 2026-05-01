---
title: Generate route — POST /api/content/[id]/generate
type: entity
code_refs: [src/app/api/content/[id]/generate/route.ts, src/lib/content-generation-system-prompt.ts, src/lib/claude-path.ts, src/app/content/[id]/page.tsx, src/components/content/ContentItemDetailIdea.tsx]
sources: [raw/decisions/append-only-agent-contract-2026-04-26.md, raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/content-item-model.md, pages/entities/chat-route.md, pages/concepts/sse-streaming.md, pages/concepts/append-only-agent-contract.md]
created: 2026-04-29
updated: 2026-05-01
confidence: high
---

# Generate route

Spawns the Claude CLI as a subprocess to design slides for a `ContentItem`, streams its progress to the browser via SSE, and flips the item to `generated` on clean exit.

## Lifecycle

1. **Pre-flight** (`src/app/api/content/[id]/generate/route.ts:19`):
   - 503 if Claude CLI is not on disk.
   - 404 if the content item is missing.
   - 409 if `state === "generating"` already (prevents duplicate spawns when the user spams the button — see commit `7b237bf`).
2. **State flip to `generating`** before the spawn (so concurrent reads see the correct state and the [[concepts/append-only-agent-contract]] kicks in).
3. **Spawn** with `cross-spawn` when the resolved CLI path is a `.cmd`/`.bat` shim, otherwise Node's `spawn`. See [[sources/windows-claude-cli-silent-failure-2026-04-15]] for why.
4. **Stream** newline-delimited Claude `stream-json` events from stdout, translate to SSE events on the response (`type: token`, `type: result`).
5. **Timeout** at 8 minutes (`maxDuration: 300` on the route, internal `setTimeout` at 480_000 ms kills the subprocess).
6. **On exit**: success → `updateContentItem(id, { state: "generated" })` (auto-stamps `generatedAt`); non-zero → emit `event: error` with stderr (capped at 8 KB) and *leave state as `generating`* (intentional — Task 8 will add a retry path).
7. Always emits `event: done` with `{ contentItemId, exitCode }` before closing.

## Spawn args

`-p <user message> --output-format stream-json --include-partial-messages --verbose --append-system-prompt <prompt> --allowedTools Bash WebFetch --max-budget-usd 1.00 --name content-generation`. The agent uses `curl` against the local `/api/content/[id]/slides` endpoint to append slides; see [[entities/content-routes]].

## System prompt

Built by `buildContentGenerationSystemPrompt` (`src/lib/content-generation-system-prompt.ts`) from the content item, brand config, and business context. Instructs the agent to send `X-Agent-Origin: claude` on every write and treat 409 as a hard stop.

## Failure modes

- Spawn `ENOENT` → `event: error` with `{ error, code, path, message }` then close.
- Subprocess error → `event: error` with stderr tail.
- Client disconnect → `cancel()` aborts the subprocess via `AbortController`.

## Client contract

The browser side is split across two files:

- **`src/components/content/ContentItemDetailIdea.tsx`** owns the "Generate" button. It calls the parent-supplied `onStartGeneration()` and renders error state from the result. It does **not** own the request lifecycle anymore — only the local `isGenerating` flag for button disable. On `{ ok: true }` the parent flips `item.state` to `"generating"`, this component unmounts, and the editor view takes over; on `{ ok: false }` it surfaces `result.error` inline.
- **`src/app/content/[id]/page.tsx`** owns the `fetch`, the `AbortController`, and the SSE body reader (`consumeGenerationStream`).

Lifecycle on the client:

1. **POST `/api/content/[id]/generate`.** `409` → return `{ ok: false, error: "Generation is already in progress…" }`. Other non-2xx → `{ ok: false, error: "Failed to start generation…" }`. Network throw → `{ ok: false, error: "Network error…" }`. 2xx → continue.
2. **Optimistic state flip.** Set local `item.state = "generating"` and `isGenerating = true` so the page swaps from idea view to editor view immediately.
3. **Spawn the SSE reader.** A fresh `AbortController` replaces any previous one; its `signal` is passed to `consumeGenerationStream(res, signal)`. The previous controller (if any) is aborted first to avoid two concurrent readers.
4. **Stream consumption.** Each chunk read from `res.body` is treated as a "something changed" pulse, **not** parsed. The reader triggers `fetchItem()` (a `GET /api/content/[id]`) but throttles to ≥600 ms gaps: if the gap is shorter, the call is deferred via `setTimeout` to coalesce bursts.
5. **Stream end.** On `done` (or any read error that isn't an explicit abort), the reader does one final `fetchItem()` and clears `isGenerating`.
6. **Unmount / abort.** A `useEffect` cleanup aborts the controller on unmount; the reader catches the abort, skips the final `fetchItem`/`isGenerating` reset, and returns silently.
7. **Fallback poll.** A separate effect polls `GET /api/content/[id]` every 1500 ms while `state === "generating"` **only when** `genStreamActiveRef.current === false`. This covers the "user reloaded the tab mid-generation" case, where the original POST belongs to a previous page lifecycle so there's no SSE stream to consume.

Notes:
- The reader does not parse SSE frames. It only needs to know "the server wrote something" to refetch; the actual slide deltas come from the `GET` response. This is intentional — keeps the client decoupled from the wire format.
- 409 is treated as a recoverable user-visible error, not a state desync. The page does not auto-resync on 409 because the optimistic flip hasn't happened yet.
- See [[concepts/sse-streaming]] for the wire protocol shared with the chat route.

## Recent changes

- 2026-04-26 (`2e28c26`) — Initial endpoint.
- 2026-04-26 (`cca70c2`) — System prompt updated for append-only.
- 2026-04-28 (`7b237bf`) — Returns 409 if already generating; client debounces the button.
- 2026-05-01 (`c552e67`) — Content page client consumes the SSE body for live refetches instead of polling; 1500 ms fallback poll only fires when no stream is active (e.g. reload mid-generation).
