---
title: Generate route — POST /api/content/[id]/generate
type: entity
code_refs: [src/app/api/content/[id]/generate/route.ts, src/lib/content-generation-system-prompt.ts, src/lib/claude-path.ts]
sources: [raw/decisions/append-only-agent-contract-2026-04-26.md, raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/content-item-model.md, pages/entities/chat-route.md, pages/concepts/sse-streaming.md, pages/concepts/append-only-agent-contract.md]
created: 2026-04-29
updated: 2026-04-29
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

## Recent changes

- 2026-04-26 (`2e28c26`) — Initial endpoint.
- 2026-04-26 (`cca70c2`) — System prompt updated for append-only.
- 2026-04-28 (`7b237bf`) — Returns 409 if already generating; client debounces the button.
