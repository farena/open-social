---
title: Source — Carousel → ContentItem pivot
type: source
code_refs: [src/types/content-item.ts, src/lib/content-items.ts, src/app/api/content, src/components/dashboard/IdeationChat.tsx, src/components/dashboard/ContentItemsTable.tsx]
sources: [raw/decisions/carousel-to-content-item-pivot-2026-04-26.md]
related: [pages/entities/content-item-model.md, pages/entities/content-routes.md, pages/entities/generate-route.md, pages/concepts/append-only-agent-contract.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Source — Carousel → ContentItem pivot (2026-04-26)

## What it changes

Replaces the `Carousel` entity with `ContentItem`, which spans an `idea → generating → generated` state machine and carries both copy fields (`hook`, `bodyIdea`, `caption`, `hashtags`) and visual fields (`slides`).

## Pages affected

- [[entities/content-item-model]] — new entity, new persistence file (`data/content-items.json`).
- [[entities/content-routes]] — `/api/content/*` replaces `/api/carousels/*`.
- [[entities/generate-route]] — non-blocking generation flow only makes sense in the new state machine.
- [[entities/slide-editor]] — same editor, now operates on a `ContentItem.slides` array.
- [[concepts/append-only-agent-contract]] — required to make non-blocking generation safe.

## Key claims (with citations)

- `ContentItem.state` is `"idea" | "generating" | "generated"` (see `src/types/content-item.ts:10`).
- `aspectRatio` defaults from `type` via `DEFAULT_ASPECT_RATIO_FOR_TYPE` (see `src/types/content-item.ts:37`).
- `state: "generating"` triggers the [[concepts/append-only-agent-contract]] (see `src/app/api/content/[id]/slides/[slideId]/route.ts`).
- `data/carousels.json` is no longer written; `data/content-items.json` is the live store (see `src/lib/content-items.ts:15`).

See raw: `wiki/raw/decisions/carousel-to-content-item-pivot-2026-04-26.md`.
