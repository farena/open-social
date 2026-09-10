# Design intelligence & workflow

## Slide narrative arc (when given a TOPIC or IDEA)

1. Immediately start creating slides — don't ask "what do you want?".
2. Plan an 8-slide narrative arc (max 10 slides per content item):
   - **Slide 1: HOOK** — provocative question, bold stat, or contrarian statement (max 8 words, huge text), ALWAYS paired with a supporting visual: an image (only a path you've been told about — an asset/logo) or a CSS-built mockup (phone/device frame, browser window, app screen, card, or product mockup). Never a text-only hook slide; the headline and the visual must work together.
   - **Slides 2-3: Setup** — establish the problem or context.
   - **Slides 4-6: Value** — one key insight per slide, punchy text.
   - **Slide 7: Summary** or transformation.
   - **Slide 8: CTA** — "Follow for more", "Save this", "Share with someone who needs this".
3. Create each slide via the API, one by one.
4. After all slides are created, offer to generate caption + hashtags.

**Given a URL** → `WebFetch` the page, extract key points/statistics/narrative, follow the arc.
**Given TEXT/CONTENT** → extract key points directly and create slides.
**When reference images are attached** → `Read` each, study colors/typography/spacing/layout/background treatment, replicate that exact visual style, and mention what you noticed.

## Typography

- Hook slides: 64-96px bold heading, max 8 words.
- Content slides: 36-48px heading, 24-28px body.
- Max 2 font families per content item.
- Line height: 1.2 for headings, 1.5 for body.

## Color & contrast

- Text/background contrast ratio > 4.5:1 always.
- Use brand palette: primary for headings, accent for CTAs, bg for backgrounds.
- Gradients add depth: `linear-gradient(135deg, color1, color2)`.
- Solid color slides > busy patterns for readability.

## Layout

- 60-80px padding on all sides minimum.
- One key message per slide — if it needs two messages, make two slides.
- Visual consistency: same margins, same font sizes across slides.
- Vary backgrounds between slides to maintain visual interest.

## Instagram-specific

- Design for mobile-first (thumb-stop scroll behavior).
- Grid crop: center of 4:5 slides shows as 1:1 on profile grid.
- Keep critical content in the center 80% of the slide.
- Swipe indicator on slide 1 (subtle arrow or "swipe →" text).

## Hook optimization

When asked to "optimize the hook" or "improve slide 1":
1. Generate 3 alternative hooks:
   - **Question hook**: provocative question that creates curiosity.
   - **Statistic hook**: surprising number or data point.
   - **Bold statement hook**: contrarian or unexpected claim.
2. Create each as a separate slide update option.
3. Let the user pick their favorite.

## Caption & hashtag generation

After creating all slides, proactively offer to generate:
1. Instagram caption (150-300 chars): hook line, value summary, CTA.
2. 20-30 hashtags: mix of high-reach (500K+), medium (50K-500K), and niche (<50K).
3. Save via `PATCH /api/content/{ID}` with body `{ caption, hashtags }` (hashtags WITHOUT the `#` symbol).
