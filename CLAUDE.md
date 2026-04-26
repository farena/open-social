# Open Social

AI-powered Instagram content builder. Next.js 16 + React 19 + TypeScript + Tailwind v4.

## Architecture

- **Frontend**: React app at localhost:3000 with ideation chat (left), content table (center on dashboard) or slide editor (center on detail)
- **AI Agent**: Claude CLI spawned as subprocess via `/api/chat`, communicates through SSE streaming
- **Storage**: JSON files in `/data/` with async-mutex locking and atomic writes
- **Export**: Puppeteer screenshots HTML slides to PNG at exact Instagram dimensions
- **Slides**: Full HTML documents rendered in sandboxed iframes. `wrapSlideHtml()` in `src/lib/slide-html.ts` is the shared rendering contract between preview and export.

## Key Files

- `src/lib/chat-system-prompt.ts` — Dynamic system prompt (injects brand config + content item context)
- `src/lib/slide-html.ts` — `wrapSlideHtml()` wraps slide body HTML into full documents
- `src/lib/data.ts` — JSON storage with proper async-mutex and atomic writes
- `src/lib/content-items.ts` — ContentItem and slide CRUD with version history
- `src/lib/claude-path.ts` — Portable Claude CLI discovery
- `src/types/content-item.ts` — ContentItem type + state definitions
- `src/lib/content-item-schema.ts` — Zod schemas for ContentItem validation

## API Routes

All at localhost:3000:

- `POST /api/chat` — Claude CLI subprocess + SSE streaming
- `GET/POST /api/content` — List/create content items
- `GET/PATCH/DELETE /api/content/[id]` — Single content item
- `POST /api/content/[id]/generate` — Kick off Claude slide generation (SSE stream)
- `GET/POST /api/content/[id]/slides` — List slides / add slide
- `PUT /api/content/[id]/slides` — Reorder slides (body: { slideIds: [...] })
- `GET/PUT/DELETE /api/content/[id]/slides/[slideId]` — Single slide
- `POST /api/content/[id]/slides/[slideId]/undo` — Undo slide change
- `POST /api/content/[id]/export` — Export all slides to PNG ZIP
- `GET/PUT /api/brand` — Brand configuration
- `GET/POST /api/templates` — Templates
- `POST /api/upload` — Image upload (PNG/JPG/WebP only, max 10MB)
- `GET /api/fonts` — Google Fonts list

## Conventions

- Components max ~300 lines per file
- Use `cn()` from `src/lib/utils.ts` for class merging
- Types in `src/types/`, libs in `src/lib/`, components in `src/components/`
- All data mutations go through `src/lib/data.ts` (never direct fs writes for JSON)
- iframe slides always use `sandbox=""` attribute (no JavaScript execution)
- The Claude subprocess gets `--allowedTools Bash WebFetch` and uses curl to call local API routes

## Instagram Dimensions

- 1:1 = 1080x1080 (square)
- 4:5 = 1080x1350 (portrait, recommended)
- 9:16 = 1080x1920 (story)
- Max 10 slides per content item

## Slide HTML Rules

Slides store body-level HTML only (no `<html>`, `<head>`, `<!DOCTYPE>`). The `wrapSlideHtml()` function adds the full document structure, font loading, and dimension constraints. Slides should:

- Use inline styles or `<style>` tags
- Reference images as `/uploads/{filename}` paths
- Use Google Font family names in font-family declarations
- NOT contain `<script>` tags (enforced by iframe sandbox)
- Target the content item's aspect ratio dimensions
