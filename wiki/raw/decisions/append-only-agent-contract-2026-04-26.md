---
origin: commit cca70c2 ("feat(content): enforce append-only agent contract during generation")
date: 2026-04-26
related_code: src/app/api/content/[id]/slides/[slideId]/route.ts, src/lib/content-generation-system-prompt.ts, src/app/api/content/[id]/generate/route.ts
---

# Decision — Agent is append-only during ContentItem generation

## Context

Generation is non-blocking by design (see [[carousel-to-content-item-pivot-2026-04-26]]): the user opens the editor immediately and the Claude subprocess streams slides in over time. This creates a race window in which the user might edit slide *N* while the agent is still adding slide *N+1*. If the agent is allowed to PUT or DELETE slides (or rewrite the whole list), it can stomp the user's concurrent edits — there is no merge story.

## Decision

During `state === "generating"`:

- The agent **may** `POST /api/content/[id]/slides` (append a new slide).
- The agent **may not** `PUT /api/content/[id]/slides/[slideId]` or `DELETE` any slide.
- The server enforces this by inspecting the `X-Agent-Origin: claude` header. If the header is present and the ContentItem state is `generating`, PUT and DELETE return `409 Conflict`.
- User-originated requests carry no header and are always permitted, regardless of state.

The system prompt (`src/lib/content-generation-system-prompt.ts`) instructs the agent to send the header, POST only, and treat any 409 as a hard stop (do not retry, do not fall back to PUT).

## Alternatives considered

- **Optimistic locking with a version number on the slide** — rejected: heavier on the agent (must read-then-write with an `If-Match`), and provides merge semantics we do not actually want (the user's edit always wins).
- **Pause user edits during `generating`** — rejected: defeats the whole point of the non-blocking model. The user is supposed to be able to edit slide 1 while slide 5 is being designed.

## Constraints

- The header is the only signal. There is no per-request auth; trust comes from the agent being a local subprocess. If we ever expose generation to a remote agent we will need a real auth signal.
- `legacyHtml` cleanup and other batch mutations the agent might want to do are blocked by this contract. That is intentional — those should be one-shot scripts run outside generation, not agent operations.

## Outcome

Shipped in commit `cca70c2`. The append-only invariant is the foundation of the [[append-only-agent-contract]] concept page.
