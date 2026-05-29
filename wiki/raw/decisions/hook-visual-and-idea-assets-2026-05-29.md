---
origin: session 2026-05-29 (commits: cabb2a7 vicinity)
date: 2026-05-29
related_code: src/lib/content-generation-system-prompt.ts, src/lib/chat-system-prompt.ts, src/lib/content-idea-system-prompt.ts, src/app/api/chat/route.ts, src/app/api/content/[id]/generate/route.ts, src/components/content/ContentIdeaChat.tsx, src/components/content/ContentItemDetailIdea.tsx
---

# Decision — Hook slide must carry a visual; idea phase gets the same asset UI as generation

## Context

Two related pain points emerged from early content performance reviews:

1. **Hook slides (Slide 1) were text-only by default.** The design agent would produce a Slide 1 that was just a bold headline on a background gradient. Text-only hooks have lower "thumb-stop" rates on Instagram — a visual element (photo, logo, product mockup) draws the eye and stops the scroll before the user reads a word.

2. **Assets and reference images were invisible to the idea-refinement agent.** A user could attach a brand logo or a product photo to a content item in the `idea` state and then open the idea chat (`ContentIdeaChat`) — but the chat panel showed no indication of those attachments, and the system prompt received by the Claude subprocess had no knowledge of them. The user had no way to say "use the logo here" and have the agent incorporate that guidance into the hook/bodyIdea/notes before clicking Generate. Furthermore, the button-triggered generation route (`/api/content/[id]/generate`) also did not inject reference images or assets into the design system prompt, so the design agent couldn't use them even if the user had attached them.

## Decisions

### Decision A — Slide 1 must always pair hook text with a supporting visual

The system prompts for `buildContentGenerationSystemPrompt` (carousel arc + single-slide post/story) and the carousel narrative arc section of `buildSystemPrompt` (editor-mode chat) were updated to make Slide 1's visual requirement explicit and non-negotiable:

- The visual can be either an `image` element with a **known** path (brand logo if configured, or an asset URL from the `/uploads` list — never an invented path) or a CSS-built mockup using `container` elements (phone/device frame, browser window, app screen, card, product mockup).
- A text-only Slide 1 is now forbidden by the prompt.
- The headline and visual must work together compositionally (e.g. text on one side, mockup on the other; text overlaid on a framed device).
- For carousels, if an asset fits the hook, it is preferred over a CSS mockup.

Motivation: Instagram carousels live or die by Slide 1 thumb-stop rate. Adding any visual — even a simple device frame around a screenshot — consistently outperforms pure text hooks.

### Decision B — Idea-phase chat and button generation both see assets + reference images

**Idea chat UI**: `ContentIdeaChat` gained a `referenceImages` prop and now mounts the same three attachment components that `ChatPanel` (editor mode) already shows: `<ReferenceImages>`, `<Assets scope="carousel">`, and `<Assets scope="library">`. `ContentItemDetailIdea` passes `contentItem.referenceImages ?? []` down. This makes the attachment list visible and interactive in the idea phase, not just in the editor.

**Idea chat system prompt**: `buildContentIdeaSystemPrompt` gained a fourth parameter `libraryAssets: Asset[]`. Two new informational sections are injected into the prompt:
- A "Reference images" section listing `item.referenceImages` with their `absPath` values, instructing the agent it can `Read` them to inform art-direction notes — but the agent's mandate remains text-field-only (no slide creation).
- An "Assets" section listing both item-scoped assets and global library assets, framed as "these will be available to the design engine at generation time — factor them into your bodyIdea/notes."

**Idea chat route**: `/api/chat` in `content-idea` mode now calls `listAssets()` and passes the result as the fourth argument to `buildContentIdeaSystemPrompt`. Previously this argument was absent and library assets were omitted.

**Generation route**: `/api/content/[id]/generate` now calls `listAssets()` (in parallel with `getBrand()` and `getBusinessContext()`) and passes `libraryAssets` to `buildContentGenerationSystemPrompt`. It also passes `--allowedTools Read` to the Claude CLI subprocess, enabling the agent to actually open and inspect reference image files before designing Slide 1. Previously neither library assets nor the `Read` tool were available to the design agent.

## Alternatives considered

- **Inject assets into generation only, not idea phase** — rejected: the user would have no way to communicate asset intent through the idea agent. A user saying "use the product-photo asset for the hook" would be ignored.
- **Auto-select an asset for Slide 1 in code** — rejected: the agent has richer compositional context (it knows the hook text, the aspect ratio, brand colors) and is better placed to decide where and how to use an asset. The prompt guides it to prefer assets for Slide 1 when one fits.
- **Require a visual on every slide, not just Slide 1** — rejected: body slides (2–7) benefit from clean text layouts; forcing visuals on all slides reduces readability. The constraint is scoped to the hook only.
- **Use `WebFetch` instead of `Read` for reference images** — rejected: reference images are local files at absolute paths (`absPath`), not URLs. `Read` is the correct tool.

## Constraints

- The `Read` tool in the generation agent gives it local filesystem read access. The paths exposed are only the ones listed in `item.referenceImages[].absPath`, which are under the `public/uploads/` tree. This is acceptable for a local-only tool.
- The idea agent's mandate does not change: it may only call `PATCH /api/content/{id}` on text fields. The asset/reference sections in its prompt are informational only. Preventing slide creation in idea mode is enforced by the system prompt, not the server.
- Library assets come from `listAssets()` with `scope: "library"` filter — no change to the asset data model.

## Outcome

All six files listed above were updated. The two changes are deployed together because Decision B is a prerequisite for Decision A to be effective: the design agent can only use a reference image on Slide 1 if the generation route injects the reference and enables `Read`.
