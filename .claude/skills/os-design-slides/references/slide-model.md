# Slide model — STRUCTURED JSON (CRITICAL)

Slides are structured JSON, not HTML. Every slide is `{ background, elements, notes, ... }`. The renderer turns this into pixel-perfect HTML — you do NOT write HTML or CSS at the document level.

## Canvas

- Dimensions come from the content item's `aspectRatio` (origin top-left):
  - `1:1` → 1080x1080
  - `4:5` → 1080x1350 (recommended default)
  - `9:16` → 1080x1920
- Use the brand defaults you loaded in Step 0 for heading/body fonts and primary/accent/background colors.

## Background (one per slide)

```json
{ "kind": "solid", "color": "#ffffff" }
{ "kind": "gradient", "angle": 135, "stops": [{ "offset": 0, "color": "#2fd9b0" }, { "offset": 1, "color": "#00c4ee" }] }
{ "kind": "image", "src": "/uploads/photo.jpg", "fit": "cover" }
```

## Element kinds — only TWO

Every element has: `id`, `position: { x, y }`, `size: { w, h }`, optional `rotation`, `opacity`, `hidden`, `scssStyles`.

**container** — arbitrary HTML body with scoped CSS. Use this for anything that isn't a raster image: text, decorative shapes, badges, compositions, full-bleed layouts, etc.

```json
{
  "id": "el-1",
  "kind": "container",
  "position": { "x": 90, "y": 200 },
  "size": { "w": 900, "h": 280 },
  "htmlContent": "<h1 class=\"title\">Hola <span class=\"accent\">mundo</span></h1>",
  "scssStyles": "display: flex; align-items: center; justify-content: center;\n& .title { font-family: 'Inter', sans-serif; font-size: 96px; font-weight: 800; color: #fff; line-height: 1; margin: 0; }\n& .accent { color: <BRAND_ACCENT>; }"
}
```

**image** — a single raster image:

```json
{
  "id": "el-2",
  "kind": "image",
  "position": { "x": 100, "y": 100 },
  "size": { "w": 400, "h": 400 },
  "src": "/uploads/logo.png",
  "scssStyles": "border-radius: 16px; overflow: hidden;\n& img { object-fit: cover; }"
}
```

## scssStyles — native CSS with nesting

`scssStyles` is plain CSS (no compiler), scoped to the element via an injected `<style>[data-element-id="ID"] { ... }</style>` block. You can use:
- Native CSS nesting with `&` (e.g. `& h1 { ... }`, `& .pill:hover { ... }`)
- CSS custom properties (`--name: value;` + `var(--name)`)
- All standard CSS — gradients, shadows, filters, transforms, blends, grid, flex, etc.

Authoring tips:
- Use semantic class names inside `htmlContent` (`.title`, `.kicker`, `.cta`) and target them with nested rules in `scssStyles`.
- The wrapper itself is the scope, so top-level declarations apply to the wrapper div (e.g. `background: navy;` paints the whole container).
- Iframe sandbox blocks JS, so `<script>` inside `htmlContent` won't execute. Don't bother with it.

## Modeling guide

- Coordinates are absolute pixels in canvas space (0..width horizontal, 0..height vertical).
- Element order in `elements` defines z-index — later items render on top.
- Prefer ONE container per visual region (a headline + its kicker can be a single container with two child tags styled via nested CSS) instead of N tiny elements.
- The container's `size` is the wrapper box — your `htmlContent` lays out within it via flex/grid in `scssStyles`.

## Slide composition rules (CRITICAL)

1. The body is structured JSON. `htmlContent` is HTML inside a single container element, NOT a full slide HTML.
2. Do NOT include `<script>` or `<iframe>` in `htmlContent` (sandbox blocks JS anyway).
3. Coordinates must keep the visible portion of every element fully or mostly inside the canvas (some overflow is OK for design, but most content should be inside the safe area: 60-80px from each edge).
4. Use Google Font family names that exist on Google Fonts inside `scssStyles` (e.g., `font-family: 'Inter', sans-serif`). The renderer auto-loads them.
5. Image `src` must be a `/uploads/{filename}` path you've been told about (in the loaded Assets) or the brand logo. Don't invent paths.

## Icons — Material Symbols (Google)

Google Material Symbols are available as a Google Font. Use them for visual emphasis: bullet markers, feature lists, CTAs, decorative accents in headings, status badges. The font loader detects the family name and pulls the variable font with all axes (opsz, wght, FILL, GRAD), so you can tune them via CSS.

### How to use
1. Default family: `'Material Symbols Rounded'` (use this unless you have a reason to switch).
2. Other variants: `'Material Symbols Outlined'` (geometric), `'Material Symbols Sharp'` (angular). Pick ONE per content item for visual consistency.
3. Insert the icon as text content of a span/div, where the text is the icon's snake_case name from https://fonts.google.com/icons.

### Example (inside an element's htmlContent + scssStyles)

```json
{
  "id": "feature-1",
  "kind": "container",
  "position": { "x": 80, "y": 600 },
  "size": { "w": 920, "h": 120 },
  "htmlContent": "<div class=\"row\"><span class=\"ico\">school</span><p>Gestión académica integral</p></div>",
  "scssStyles": "& .row { display: flex; align-items: center; gap: 24px; }\n& .ico { font-family: 'Material Symbols Rounded'; font-size: 64px; color: <BRAND_ACCENT>; font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 48; line-height: 1; }\n& p { font-family: 'Inter', sans-serif; font-size: 32px; color: #fff; margin: 0; }"
}
```

### CSS knobs
- `font-size` — icon size in px (also drives bounding box).
- `color` — icon color (the icon paints with currentColor).
- `font-variation-settings: 'FILL' 0 | 1` — outline (0) vs filled (1).
- `font-variation-settings: 'wght' 100..700` — stroke weight.
- Always set `line-height: 1` on the icon span so it doesn't add vertical padding.

### Safe vocabulary (icons that exist and fit education / SaaS topics)
school, language, translate, group, groups, person, supervisor_account, menu_book, edit_note, assignment, fact_check, check_circle, task_alt, verified, trending_up, insights, bar_chart, dashboard, schedule, event, calendar_month, payments, credit_card, mail, chat, support_agent, lightbulb, rocket_launch, bolt, star, favorite, arrow_forward, arrow_outward, swipe, settings, lock, public, devices, smartphone

You can use other icon names from fonts.google.com/icons — but stick to ones you're sure exist (snake_case, lowercase). If the name doesn't exist, the icon renders as literal text, which looks broken.

### Don't
- Don't mix Material Symbols variants (Rounded + Outlined) in the same content item.
- Don't use icons for decoration on every slide — they should reinforce a message, not clutter.
- Don't put icons in 8+ places on one slide. 1–3 icons per slide is the sweet spot.
