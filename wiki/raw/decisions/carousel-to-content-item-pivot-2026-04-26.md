---
origin: docs/plans/2026-04-26-open-social-pivot.md (planning) + commits e9e8e62, b2eb327, d7b9a2b, 478294b, 1a5f9cf, d931620, 6c4a59b, aab095d, 4468ea9, 09c7cb6
date: 2026-04-26
related_code: src/types/content-item.ts, src/lib/content-items.ts, src/lib/content-item-schema.ts, src/app/api/content/, src/components/dashboard/, src/components/content/
---

# Decision — Collapse Carousel into a unified ContentItem

## Context

Original product modelled "carousel" as the only deliverable: a `Carousel` entity with slides was the unit of work. The dashboard showed a card grid of carousels; everything (chat, editor, generation) hung off that single shape. The new product direction (Open Social, post-rebrand) needs to support multiple Instagram surfaces — single-image posts, stories, carousels — and to make ideation a first-class state, not just a side-effect of opening a card.

## Decision

Replace `Carousel` with `ContentItem`, a single entity that lives across three states (`idea → generating → generated`) and carries both copy fields (`hook`, `bodyIdea`, `caption`, `hashtags`) and visual fields (`slides`). One persisted entity, one editor, one chat surface — typed by `ContentItemType: "post" | "story" | "carousel"`, with `aspectRatio` derived per type.

Storage moves from `data/carousels.json` to `data/content-items.json`. The old `Carousel` type and `src/lib/carousels.ts` are removed (commit 4468ea9). Routes move under `/api/content/[id]/*`; legacy `/carousel/[id]` redirects to `/content/[id]` (commit 09c7cb6).

The dashboard becomes a chat + table split (commit d931620): an ideation chat on the left batch-creates `ContentItem`s in `idea` state, a table on the right lists them with state badges. Generation is non-blocking: the user navigates into the editor and slides stream in; concurrent edits are safe because of the [[append-only-agent-contract]].

## Alternatives considered

- **Add a `kind` field to `Carousel`** — rejected: `Carousel` already implied a multi-slide format; reusing the name for single-image posts and stories would be confusing in code and prompts alike.
- **Two entities (Idea + Carousel)** — rejected: a state field on one entity is simpler than tracking a foreign key from Idea to whatever gets generated, and matches the user's mental model ("an Instagram post in progress").

## Constraints

- The slide model itself (`Slide`, `Background`, `Element`) is unchanged — only the parent entity changes. The slide editor is reused as-is.
- Migration path: `scripts/migrate-to-content-items.mjs` lifts existing carousels into the new shape with `state: "generated"`.
- Phased rollout: the plan's steps 1–4 ship the new entity + storage + API + editor wiring without touching the dashboard UI; steps 5–8 swap the UX; step 9 deletes the old surface.

## Outcome

Shipped across commits `e9e8e62..4468ea9`. The deprecated `/carousel/*` surface and `src/lib/carousels.ts` are removed; CLAUDE.md updated in `9fb98ff`.
