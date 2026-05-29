---
title: Hook slide visual requirement + idea-phase asset injection (2026-05-29)
type: source
code_refs: [src/lib/content-generation-system-prompt.ts, src/lib/chat-system-prompt.ts, src/lib/content-idea-system-prompt.ts, src/app/api/chat/route.ts, "src/app/api/content/[id]/generate/route.ts", src/components/content/ContentIdeaChat.tsx, src/components/content/ContentItemDetailIdea.tsx]
sources: [raw/decisions/hook-visual-and-idea-assets-2026-05-29.md]
related: [pages/entities/chat-route.md, pages/entities/generate-route.md, pages/entities/content-item-model.md]
created: 2026-05-29
updated: 2026-05-29
confidence: high
---

# Hook slide visual requirement + idea-phase asset injection

Two decisions shipped together on 2026-05-29.

## Decision A — Slide 1 (hook) must always carry a supporting visual

The system prompts for both the button-triggered design agent (`buildContentGenerationSystemPrompt`) and the editor-mode chat agent (`buildSystemPrompt`, carousel arc description) were updated to make the Slide 1 visual requirement explicit:

- Forbidden: a text-only hook slide.
- Allowed: an `image` element using a **known** path (brand logo path or an asset URL from `/uploads`; never invent a path), or a CSS-built mockup via `container` elements (phone/device frame, browser window, app screen, card, product mockup).
- Preferred: if an asset fits the hook topic, use it over a CSS mockup.
- Compositional rule: headline and visual must work together (side-by-side, overlaid on framed device, etc.).

Rule applies to carousels (Slide 1 of the arc) and to single-slide post/story items (see `src/lib/content-generation-system-prompt.ts:193` for carousel arc, and `:204` for the single-slide branch).

Motivation: thumb-stop rate on Instagram increases when Slide 1 carries a visual even before the text is read.

See [[../../raw/decisions/hook-visual-and-idea-assets-2026-05-29]] for full rationale and alternatives considered.

## Decision B — Assets and reference images visible in idea phase; generation agent can read them

### UI change

`ContentIdeaChat` (`src/components/content/ContentIdeaChat.tsx:12`) gained a `referenceImages` prop and now renders three attachment widgets identical to `ChatPanel` (editor mode):

```
<ReferenceImages contentItemId={...} images={referenceImages} ... />
<Assets scope="carousel" contentItemId={...} />
<Assets scope="library" />
```

`ContentItemDetailIdea` passes `contentItem.referenceImages ?? []` as the `referenceImages` prop (see `src/components/content/ContentItemDetailIdea.tsx:121`).

### Idea agent system prompt

`buildContentIdeaSystemPrompt` (`src/lib/content-idea-system-prompt.ts:6`) gained a fourth parameter `libraryAssets: Asset[]`. Two informational sections are injected:

- **Reference images section** (lines ~55–61): lists `item.referenceImages` with their `absPath`; tells the agent it can `Read` them for art-direction notes but its mandate stays text-fields-only.
- **Assets section** (lines ~63–72): lists item-scoped + library assets; frames them as "will be available to the design engine at generation time — factor them into bodyIdea/notes."

The `/api/chat` route (`src/app/api/chat/route.ts:76`) now calls `listAssets()` alongside `getBrand()`, `getBusinessContext()`, and `getContentItem()` in the `content-idea` branch, and passes the result to `buildContentIdeaSystemPrompt`.

### Generation agent system prompt + tools

`buildContentGenerationSystemPrompt` (`src/lib/content-generation-system-prompt.ts:7`) already had a `libraryAssets?: Asset[]` parameter stub; the route now populates it.

`/api/content/[id]/generate` (`src/app/api/content/[id]/generate/route.ts:42`) now calls `listAssets()` in the parallel `Promise.all` block alongside `getBrand()` and `getBusinessContext()`, and passes the result as `libraryAssets`.

The CLI spawn args now include `--allowedTools Read` (line ~87), enabling the agent to open reference image files (absolute paths from `referenceImages[].absPath`) to inspect visual style before designing slides. The `Read` tool was previously absent from the generation spawn.

## Takeaways

- The idea agent's mandate is informational-only: it reads assets/references but never creates slides. The boundary is enforced by the system prompt, not the server.
- `Read` in the generation agent is scoped to what the prompt exposes (`referenceImages[].absPath`). No other filesystem paths are mentioned.
- Both changes are deployed together: Decision B is a prerequisite for Decision A — the generation agent can only use a reference image if it is injected into the prompt and `Read` is enabled.
