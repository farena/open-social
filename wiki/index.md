# Open Social — Wiki Index

Karpathy-style LLM wiki. Pages are compiled at ingest time from decisions, incidents, external docs, and the source tree. The code under `src/` is the source of truth for *what*; this wiki carries *why*.

## Entities

- [content-item-model](pages/entities/content-item-model.md) — unified entity (`idea → generating → generated`) replacing Carousel
- [content-routes](pages/entities/content-routes.md) — `/api/content/*` REST surface (CRUD, slides, assets, references)
- [generate-route](pages/entities/generate-route.md) — SSE endpoint that spawns Claude CLI to design slides
- [chat-route](pages/entities/chat-route.md) — Claude CLI subprocess + SSE streaming for ideation/context chat
- [slide-editor](pages/entities/slide-editor.md) — Canvas/overlay editor over the structured slide model
- [structured-slide-pipeline](pages/entities/structured-slide-pipeline.md) — slide types/schema/serializer/migrator/coords/defaults
- [export-pipeline](pages/entities/export-pipeline.md) — Puppeteer renderer + ZIP packager that screenshots `wrapSlideHtml()` output
- [business-context](pages/entities/business-context.md) — persisted business profile injected into prompts
- [wiki-query](pages/entities/wiki-query.md) — local BM25 CLI over `wiki/pages/` (no LLM, no network)

## Concepts

- [sse-streaming](pages/concepts/sse-streaming.md) — newline-delimited `data:` events from Claude subprocess to browser
- [structured-slide-model](pages/concepts/structured-slide-model.md) — JSON-as-source-of-truth, serializer-only-to-HTML
- [append-only-agent-contract](pages/concepts/append-only-agent-contract.md) — agent may POST slides, server rejects PUT/DELETE during `generating`
- [version-history](pages/concepts/version-history.md) — bounded per-slide snapshot stacks (`previousVersions` + `nextVersions`), server-side undo / redo
- [storage-architecture](pages/concepts/storage-architecture.md) — unified SQLite DB (`data/sales.db`), eight tables, singleton vs. collection pattern, test isolation, migration history
- [migrations](pages/concepts/migrations.md) — Sequelize-style runner at `scripts/migrate.ts`, `migrations/` files with `up`/`down`, separate dev/test DB targets

## Sources

- [carousel-to-content-item-pivot-2026-04-26](pages/sources/carousel-to-content-item-pivot-2026-04-26.md)
- [structured-slide-model-2026-04-25](pages/sources/structured-slide-model-2026-04-25.md)
- [append-only-agent-contract-2026-04-26](pages/sources/append-only-agent-contract-2026-04-26.md)
- [rebrand-open-social-2026-04-26](pages/sources/rebrand-open-social-2026-04-26.md)
- [windows-claude-cli-silent-failure-2026-04-15](pages/sources/windows-claude-cli-silent-failure-2026-04-15.md)
- [puppeteer-heavy-font-timeout-2026-04-29](raw/incidents/puppeteer-heavy-font-timeout-2026-04-29.md)
- [wiki-query-frontmatter-preprocessor-2026-05-01](pages/sources/wiki-query-frontmatter-preprocessor-2026-05-01.md)
- [keepalive-put-vs-sendbeacon-2026-05-01](raw/decisions/keepalive-put-vs-sendbeacon-2026-05-01.md)
- [migration-runner-2026-05-02](raw/decisions/migration-runner-2026-05-02.md)

## Comparisons

_(candidates: claude-cli-vs-sdk, html-string-vs-structured-slide — json-storage-vs-sqlite is covered by [[concepts/storage-architecture]])_

## Backlog

- [pending-tasks](pages/pending-tasks.md) — trabajo planificado pendiente de ejecución (planes en `docs/plans/`)
