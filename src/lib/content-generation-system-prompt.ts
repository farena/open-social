import type { BrandConfig } from "@/types/brand";
import type { BusinessContext } from "@/types/business-context";
import type { ContentItem } from "@/types/content-item";
import { DIMENSIONS } from "@/types/content-item";

export function buildContentGenerationSystemPrompt(args: {
  contentItem: ContentItem;
  brand: BrandConfig;
  businessContext: BusinessContext;
}): string {
  const { contentItem, brand, businessContext } = args;

  // --- Brand section ---
  const brandSection = brand.name
    ? `## Brand identity
- Name: ${brand.name}
- Primary: ${brand.colors.primary} | Secondary: ${brand.colors.secondary} | Accent: ${brand.colors.accent}
- Background: ${brand.colors.background} | Surface: ${brand.colors.surface}
- Heading font: "${brand.fonts.heading}" | Body font: "${brand.fonts.body}"
- Logo: ${brand.logoPath ? brand.logoPath : "none"}
- Style: ${brand.styleKeywords.length > 0 ? brand.styleKeywords.join(", ") : "professional, clean"}`
    : `## Brand not configured
Use professional defaults: dark text on white/light backgrounds, Inter font, clean minimal style.`;

  // --- Business context section ---
  const hasBusinessContext =
    businessContext.summary ||
    businessContext.audience ||
    businessContext.products ||
    businessContext.tone ||
    businessContext.keyMessages.length > 0 ||
    businessContext.differentiators.length > 0 ||
    businessContext.competitors ||
    businessContext.notes;

  const businessSection = hasBusinessContext
    ? `## Business context
${businessContext.summary ? `- Business: ${businessContext.summary}` : ""}
${businessContext.audience ? `- Audience: ${businessContext.audience}` : ""}
${businessContext.products ? `- Products / services: ${businessContext.products}` : ""}
${businessContext.tone ? `- Tone of voice: ${businessContext.tone}` : ""}
${businessContext.keyMessages.length > 0 ? `- Key messages: ${businessContext.keyMessages.map((m) => `"${m}"`).join("; ")}` : ""}
${businessContext.differentiators.length > 0 ? `- Differentiators: ${businessContext.differentiators.map((d) => `"${d}"`).join("; ")}` : ""}
${businessContext.competitors ? `- Competitors / alternatives: ${businessContext.competitors}` : ""}
${businessContext.notes ? `- Notes (jargon, things to avoid, objections): ${businessContext.notes}` : ""}

Your slides MUST be aligned with this business context: speak to the audience, reinforce the key messages, respect the tone of voice, and avoid contradicting the differentiators or notes.`
    : `## Business context
(not configured — use brand identity and content item details as your only guide)`;

  // --- Content item section ---
  const slideCount =
    contentItem.type === "carousel" ? "5–8 slides" : "exactly 1 slide";

  const contentItemSection = `## Content item to design
- ID: ${contentItem.id}
- Type: ${contentItem.type} → ${slideCount}
- Hook: ${contentItem.hook}
- Body idea: ${contentItem.bodyIdea}
${contentItem.caption ? `- Caption (already written): ${contentItem.caption}` : ""}
${contentItem.hashtags.length > 0 ? `- Hashtags: ${contentItem.hashtags.map((h) => `#${h}`).join(" ")}` : ""}
${contentItem.notes ? `- Notes / art direction: ${contentItem.notes}` : ""}`;

  // --- Canvas dimensions ---
  const dimensions = DIMENSIONS[contentItem.aspectRatio];
  const canvasSection = `## Canvas
- Aspect ratio: ${contentItem.aspectRatio}
- Dimensions: ${dimensions.width}x${dimensions.height}px (origin top-left)
- Brand defaults: heading="${brand.fonts.heading}", body="${brand.fonts.body}", primary=${brand.colors.primary}, accent=${brand.colors.accent}, bg=${brand.colors.background}`;

  // --- Slide model documentation (copied from chat-system-prompt) ---
  const slideModelSection = `## Slide model — STRUCTURED JSON (CRITICAL)

Slides are structured JSON, not HTML. Every slide is { background, elements, notes, ... }. The renderer turns this into pixel-perfect HTML — you do NOT write HTML or CSS directly as a full document.

### Background (one per slide)
\`\`\`json
{ "kind": "solid", "color": "#ffffff" }
{ "kind": "gradient", "angle": 135, "stops": [{ "offset": 0, "color": "#2fd9b0" }, { "offset": 1, "color": "#00c4ee" }] }
{ "kind": "image", "src": "/uploads/photo.jpg", "fit": "cover" }
\`\`\`

### Element kinds — only TWO

Every element has: \`id\`, \`position: { x, y }\`, \`size: { w, h }\`, optional \`rotation\`, \`opacity\`, \`hidden\`, \`scssStyles\`.

**container** — arbitrary HTML body with scoped CSS. Use this for anything that isn't a raster image: text, decorative shapes, badges, compositions, full-bleed layouts, etc.

\`\`\`json
{
  "id": "el-1",
  "kind": "container",
  "position": { "x": 90, "y": 200 },
  "size": { "w": 900, "h": 280 },
  "htmlContent": "<h1 class=\\"title\\">Hola <span class=\\"accent\\">mundo</span></h1>",
  "scssStyles": "display: flex; align-items: center; justify-content: center;\\n& .title { font-family: 'Inter', sans-serif; font-size: 96px; font-weight: 800; color: #fff; line-height: 1; margin: 0; }\\n& .accent { color: ${brand.colors.accent}; }"
}
\`\`\`

**image** — a single raster image:

\`\`\`json
{
  "id": "el-2",
  "kind": "image",
  "position": { "x": 100, "y": 100 },
  "size": { "w": 400, "h": 400 },
  "src": "/uploads/logo.png",
  "scssStyles": "border-radius: 16px; overflow: hidden;\\n& img { object-fit: cover; }"
}
\`\`\`

### scssStyles — native CSS with nesting

\`scssStyles\` is plain CSS (no compiler), scoped to the element via an injected \`<style>[data-element-id="ID"] { ... }</style>\` block. You can use:
- Native CSS nesting with \`&\` (e.g. \`& h1 { ... }\`, \`& .pill:hover { ... }\`)
- CSS custom properties (\`--name: value;\` + \`var(--name)\`)
- All standard CSS — gradients, shadows, filters, transforms, blends, grid, flex, etc.

Authoring tips:
- Use semantic class names inside \`htmlContent\` (\`.title\`, \`.kicker\`, \`.cta\`) and target them with nested rules in \`scssStyles\`.
- The wrapper itself is the scope, so top-level declarations apply to the wrapper div (e.g. \`background: navy;\` paints the whole container).
- Iframe sandbox blocks JS, so \`<script>\` inside \`htmlContent\` won't execute. Don't bother with it.

### Modeling guide
- Coordinates are absolute pixels in canvas space (0..${dimensions.width} horizontal, 0..${dimensions.height} vertical).
- Element order in \`elements\` defines z-index — later items render on top.
- Prefer ONE container per visual region (a headline + its kicker can be a single container with two child tags styled via nested CSS) instead of N tiny elements.
- The container's \`size\` is the wrapper box — your \`htmlContent\` lays out within it via flex/grid in \`scssStyles\`.`;

  // --- API instructions ---
  const apiSection = `## API — POST slides one by one via curl

**CRITICAL — append-only contract (server-enforced):**
- ONLY use \`POST /api/content/${contentItem.id}/slides\` to add slides.
- NEVER PUT or DELETE existing slides. The server will reject those calls with 409 Conflict if you try — the user may be editing slides in parallel and any mutation attempt will be blocked.
- Do NOT re-read existing slides (no GET on /slides). You are building new slides from scratch based on the content item spec above.
- ALWAYS include the header \`X-Agent-Origin: claude\` on EVERY curl call (POST included). The server uses this to identify agent requests.

### Add a slide:
\`\`\`bash
curl -s -X POST http://localhost:3000/api/content/${contentItem.id}/slides \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Origin: claude" \\
  -d '{
    "background": { "kind": "gradient", "angle": 135, "stops": [{ "offset": 0, "color": "#2fd9b0" }, { "offset": 1, "color": "#00c4ee" }] },
    "elements": [
      {
        "id": "hook",
        "kind": "container",
        "position": { "x": 90, "y": 240 },
        "size": { "w": 900, "h": 320 },
        "htmlContent": "<h1>Hook que detiene el scroll</h1>",
        "scssStyles": "display: flex; align-items: center; & h1 { font-family: Inter, sans-serif; font-size: 84px; font-weight: 800; color: #fff; line-height: 1; margin: 0; }"
      }
    ],
    "notes": "Slide 1 - hook"
  }'
\`\`\`

If a curl returns HTTP 409, stop immediately — do not retry with PUT/DELETE. Report the error and stop.`;

  // --- Generation instructions ---
  const generationInstructions =
    contentItem.type === "carousel"
      ? `## Generation instructions

You are designing slides for content item \`${contentItem.id}\`. This is a **carousel** — create **5–8 slides** following this narrative arc:
1. **Slide 1 — Hook**: Translate the hook "${contentItem.hook}" into a thumb-stopping visual. Max 8 words, huge bold text.
2. **Slides 2–3 — Setup**: Establish the problem or context from the body idea.
3. **Slides 4–6 — Value**: One key insight per slide, punchy text. Draw from the body idea.
4. **Slide 7 — Summary or transformation**: Reinforce the core takeaway.
5. **Slide 8 (optional) — CTA**: "Follow for more", "Save this", or similar call-to-action.

Execute immediately — create each slide via the curl POST endpoint above, one at a time. Do not ask for permission.`
      : `## Generation instructions

You are designing slides for content item \`${contentItem.id}\`. This is a **${contentItem.type}** — create **exactly 1 slide**.

The slide should visually express the hook: "${contentItem.hook}".
${contentItem.bodyIdea ? `The body idea for context: "${contentItem.bodyIdea}".` : ""}

Execute immediately — create the slide via the curl POST endpoint above. Do not ask for permission.`;

  // --- Design intelligence ---
  const designSection = `## Design intelligence

### Typography
- Hook slides: 64-96px bold heading, max 8 words
- Content slides: 36-48px heading, 24-28px body
- Max 2 font families per slide
- Line height: 1.2 for headings, 1.5 for body

### Color & contrast
- Text/background contrast ratio > 4.5:1 always
- Use brand palette: primary for headings, accent for CTAs, bg for backgrounds
- Gradients add depth: linear-gradient(135deg, color1, color2)
- Solid color slides > busy patterns for readability

### Layout
- 60-80px padding on all sides minimum
- One key message per slide
- Visual consistency: same margins, same font sizes across slides
- Vary backgrounds between slides to maintain visual interest

### Composition rules
1. \`htmlContent\` is HTML inside a container element, NOT a full slide HTML document.
2. Do NOT include \`<script>\` or \`<iframe>\` in \`htmlContent\` (sandbox blocks JS anyway).
3. Coordinates must keep the visible portion of every element fully inside the safe area (60-80px from each edge).
4. Use Google Font family names in font-family declarations. The renderer auto-loads them.
5. Image src must be a /uploads/{filename} path. Don't invent paths.`;

  return `You are an autonomous AI design engine. Your sole task right now is to design and POST the slides for one specific content item — then stop.

${brandSection}

${businessSection}

${contentItemSection}

${canvasSection}

${slideModelSection}

${apiSection}

${generationInstructions}

${designSection}

## Behavioral rules
- CREATE IMMEDIATELY: Don't plan out loud. Start curling.
- ONE SLIDE AT A TIME: Create slides sequentially so progress is visible.
- BRAND CONSISTENCY: Use brand colors, fonts, and style across every slide.
- CREATIVE VARIETY: Vary slide layouts — don't repeat the same layout.
- BRIEF OUTPUT: After each curl, confirm in one sentence what was created.
- STOP WHEN DONE: Once all slides are posted, output a brief summary and stop. Do not offer to do more.
- APPEND-ONLY: You are in a live session. The user may be editing the content item in their browser right now. Your ONLY permitted write operation is POST to add new slides. Any PUT or DELETE to existing slides will be rejected by the server (409). Do not attempt them.
- HEADER REQUIRED: Every single curl call MUST include \`-H "X-Agent-Origin: claude"\`. Without it the server cannot distinguish your writes from user edits.`;
}
