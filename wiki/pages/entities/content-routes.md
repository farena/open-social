---
title: Content API routes
type: entity
code_refs: [src/app/api/content/route.ts, src/app/api/content/[id]/route.ts, src/app/api/content/[id]/slides/route.ts, src/app/api/content/[id]/slides/[slideId]/route.ts, src/app/api/content/[id]/slides/[slideId]/undo/route.ts, src/app/api/content/[id]/assets/route.ts, src/app/api/content/[id]/assets/[assetId]/route.ts, src/app/api/content/[id]/references/route.ts, src/app/api/content/[id]/export/route.ts]
sources: [raw/decisions/carousel-to-content-item-pivot-2026-04-26.md, raw/decisions/append-only-agent-contract-2026-04-26.md]
related: [pages/entities/content-item-model.md, pages/entities/generate-route.md, pages/concepts/append-only-agent-contract.md, pages/concepts/version-history.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Content API routes (`/api/content/*`)

REST surface for [[entities/content-item-model]]. Replaces the legacy `/api/carousels/*`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/content` | List items / create from `newContentItemInput` |
| GET / PATCH / DELETE | `/api/content/[id]` | Single item |
| POST | `/api/content/[id]/generate` | Kick off Claude streaming — see [[entities/generate-route]] |
| GET / POST | `/api/content/[id]/slides` | List / append slide |
| PUT | `/api/content/[id]/slides` | Reorder (`{ slideIds: [...] }`) |
| GET / PUT / DELETE | `/api/content/[id]/slides/[slideId]` | Single slide |
| POST | `/api/content/[id]/slides/[slideId]/undo` | Pop one snapshot from `previousVersions` — see [[concepts/version-history]] |
| GET / POST | `/api/content/[id]/assets` | Per-item asset list |
| PATCH / DELETE | `/api/content/[id]/assets/[assetId]` | Per-item asset CRUD |
| GET / POST / DELETE | `/api/content/[id]/references` | Reference images |
| POST | `/api/content/[id]/export` | Puppeteer → PNG ZIP |

## Append-only enforcement

The slide route inspects `X-Agent-Origin: claude` and refuses PUT/DELETE with `409 Conflict` while `state === "generating"`. See [[concepts/append-only-agent-contract]] and `src/app/api/content/[id]/slides/[slideId]/route.ts`.

## Conventions

- All handlers run on the Node runtime (storage requires `fs`).
- Validation: every PATCH/POST body parses through the zod schema in `src/lib/content-item-schema.ts` or `src/lib/slide-schema.ts`. Parse errors return `400` with the zod issue array.
- 404 is returned when the lookup misses; `null` from `content-items.ts` always maps to 404.

## Recent changes

- 2026-04-26 (`d7b9a2b`) — Initial `/api/content` list + create.
- 2026-04-26 (`478294b`) — Slide CRUD ported from carousels.
- 2026-04-26 (`cca70c2`) — Append-only 409 enforcement on PUT/DELETE.
- 2026-04-28 (`aab095d`) — Assets and references endpoints ported under `/api/content/[id]`.
