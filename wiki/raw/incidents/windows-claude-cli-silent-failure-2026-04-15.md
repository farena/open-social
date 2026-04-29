---
origin: commit 8ba717b ("fix: Windows support for Claude CLI subprocess")
date: 2026-04-15
related_code: src/lib/claude-path.ts, src/app/api/chat/route.ts, src/app/api/content/[id]/generate/route.ts
---

# Incident — Internal AI agent never created slides on Windows

## Symptom

On Windows, opening a content item and asking the chat agent to generate slides did nothing — no streaming output, no error in the UI, no entry in `data/`. The chat just stayed silent. macOS/Linux were unaffected.

## Root cause

Two compounding issues:

1. **CLI not found.** `getClaudePath()` only searched POSIX-style locations. The Windows install puts `claude.cmd` under `%APPDATA%\npm\claude.cmd` and the agent never found it, falling back to a path that did not exist. The spawn failed with `ENOENT` but the failure was swallowed (no SSE error event was emitted; the stream just closed).
2. **Argv mangled by the `.cmd` shim.** Even when the path was correct, the subprocess was launched with Node's built-in `spawn`, which on Windows passes argv through `cmd.exe`. The system prompt is multi-line; `cmd.exe` truncates at the first newline, so the shim received a malformed command line and exited non-zero — again with no surfaced error.

## Fix

- `claude-path.ts`: add Windows-aware discovery (`%APPDATA%\npm\claude.cmd`, `%LOCALAPPDATA%`, `where claude` fallback) and export non-throwing `findClaudePath()` so the setup script can reuse it.
- `api/chat/route.ts` and `api/content/[id]/generate/route.ts`: detect `.cmd`/`.bat` shim and use `cross-spawn` instead of Node's `spawn`, so multi-line argv reaches the shim intact.
- Buffer stderr (capped at 8 KB) and emit it both to server logs and to the SSE `error` event so the next silent failure will not be silent.

## Lessons

- Any subprocess on Windows that takes a long argv must use `cross-spawn` (or equivalent) when the target is a `.cmd`/`.bat` shim. Node's `spawn` is not safe for this case.
- Spawn failures must be surfaced to the SSE stream as `event: error` — closing the stream without a payload is indistinguishable from a fast-success on the client.
- The `doctor` command should call the same `findClaudePath()` the routes use, so a misconfigured machine flags itself before the user hits chat.

## Outcome

Shipped in commit `8ba717b`. The same defensive pattern (cross-spawn for `.cmd`, capped stderr buffering, SSE `error` event on failure) was carried into `generate-route` when it was added (`2e28c26`).
