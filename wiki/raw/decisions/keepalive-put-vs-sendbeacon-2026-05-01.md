---
title: Use fetch + keepalive (PUT) for tab-close flush instead of sendBeacon
type: decision
date: 2026-05-01
related_code:
  - src/components/editor/EditorBody.tsx
  - src/app/api/content/[id]/slides/[slideId]/route.ts
sources:
  - https://github.com/kmpus/sales/commit/707c67e
---

# Decision

The editor's `beforeunload` handler flushes any pending debounced slide persist via `fetch(url, { method: "PUT", keepalive: true, ... })` rather than `navigator.sendBeacon`.

# Context

The slide endpoint is `PUT`-only (`/api/content/[id]/slides/[slideId]`). The persist debounce window can leave un-flushed edits in memory if the user closes the tab before it fires. The standard browser primitive for "send this on the way out" is `sendBeacon`, but it always issues a `POST` — there is no method override. Against the PUT-only handler this returned `405` silently (no UI feedback, no log, edits lost).

`fetch(..., { keepalive: true })` lets the browser keep the request alive past page unload and supports an arbitrary HTTP method. It is supported in all modern browsers we target.

# Alternatives considered

- **`sendBeacon`** — rejected: forces POST, would require either splitting the route or accepting a separate POST flush handler that mirrors PUT. Not worth the surface duplication.
- **Sync `XMLHttpRequest`** — rejected: deprecated in unload handlers, increasingly blocked by browsers.
- **Server-side polling for "stale unsaved edits"** — rejected: doesn't solve the data-loss window, just narrows it.

# Consequences

- The flush also short-circuits when `lastSentContentRef` matches the current signature — protects against the debounce firing immediately before unload and the keepalive PUT double-sending the same payload.
- If the slide route is ever migrated to also accept POST, `sendBeacon` becomes a viable fallback for older browsers; until then, `keepalive: true` is the only path.

# Source

- Commit `707c67e` (2026-05-01).
