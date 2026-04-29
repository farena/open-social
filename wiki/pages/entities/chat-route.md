---
title: Chat route — POST /api/chat
type: entity
code_refs: [src/app/api/chat/route.ts, src/lib/chat-system-prompt.ts, src/lib/ideation-system-prompt.ts, src/lib/content-idea-system-prompt.ts, src/lib/context-chat-system-prompt.ts, src/lib/claude-path.ts, src/lib/use-chat-stream.ts]
sources: [raw/incidents/windows-claude-cli-silent-failure-2026-04-15.md]
related: [pages/entities/generate-route.md, pages/concepts/sse-streaming.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Chat route

Generic Claude CLI subprocess endpoint used by every chat surface (ideation, per-content-item idea chat, business-context chat, in-editor chat). One endpoint, many *modes* — the `mode` field on the request selects which system-prompt builder runs.

## Modes

| Mode | System-prompt builder | Surface |
|---|---|---|
| `ideation` | `buildIdeationSystemPrompt` | Dashboard ideation chat — batch-creates `ContentItem`s in `idea` state |
| `content-idea` | `buildContentIdeaSystemPrompt` | Per-item chat while in `idea` state |
| `content-generation` | `buildContentGenerationSystemPrompt` | (used by [[entities/generate-route]], not by `/api/chat` directly) |
| `context` | `buildContextChatSystemPrompt` | Business-context page chat |
| `editor` | `buildChatSystemPrompt` | In-editor chat for slide tweaks |

The mode name `carousel` was renamed to `content-generation` in commit `714cb79`.

## Spawn

Same hardened pattern as [[entities/generate-route]]: detect `.cmd` shim → `cross-spawn`, capped stderr buffer, surface failures as SSE `event: error` (see [[sources/windows-claude-cli-silent-failure-2026-04-15]]).

## Tool-use progress

Streams not just text tokens but also tool-use deltas (commit `fa11104`): when the agent calls Bash or WebFetch, the client renders an inline status chip with a streaming preview of the tool input/output. Wiring lives in `src/lib/use-chat-stream.ts` and is consumed by every chat component (`ChatPanel`, `IdeationChat`, `ContentIdeaChat`, `BusinessContextChat`).

## Allowed tools

`--allowedTools Bash` and `--allowedTools WebFetch`. The agent uses `curl` against the local API to mutate state.

## Recent changes

- 2026-04-15 (`8ba717b`) — Windows `.cmd` shim handling + SSE error surfacing.
- 2026-04-26 (`714cb79`) — Mode rename `carousel` → `content-generation`.
- 2026-04-26 (`fa11104`) — Tool-use deltas + inline status chips.
- 2026-04-28 (`69b9d7a`) — Client `messages` initial state fixed for SSR.
- 2026-04-29 (`c896e9e`) — Editor-mode system prompt (`buildChatSystemPrompt`) now ships a Material Symbols icon guide (default `Material Symbols Rounded`, axis knobs, safe vocabulary, anti-clutter rules). Pairs with `buildGoogleFontsFamilyParam` in [[entities/structured-slide-pipeline]] so the preview iframe actually loads the variable-axis font.
