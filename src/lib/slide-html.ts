import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

/**
 * Extract Google Font family names from slide HTML.
 * Looks for font-family declarations in inline styles and <style> tags.
 *
 * Captures everything between `font-family:` and the next `;` or `}` (or end
 * of an inline `style="..."` attribute), then splits on commas and strips
 * surrounding quotes. Handles single-line and multi-line CSS uniformly.
 */
export function extractFontFamilies(html: string): string[] {
  const families = new Set<string>();
  const generics = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
  ]);
  const regex = /font-family\s*:\s*([^;}"']*(?:(?:'[^']*'|"[^"]*")[^;}"']*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();
    for (const part of raw.split(",")) {
      const name = part.trim().replace(/^['"]|['"]$/g, "");
      if (name && !generics.has(name.toLowerCase())) {
        families.add(name);
      }
    }
  }
  return Array.from(families);
}

/**
 * Build the `family=...` query param for one Google Fonts family.
 * Material Symbols variants need their variable axes spelled out; otherwise
 * Google serves a fixed default and `font-variation-settings` becomes a no-op.
 */
export function buildGoogleFontsFamilyParam(family: string): string {
  const encoded = encodeURIComponent(family);
  if (/^Material Symbols (Outlined|Rounded|Sharp)$/i.test(family)) {
    return `family=${encoded}:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`;
  }
  return `family=${encoded}:wght@300;400;500;600;700;800`;
}

/**
 * Wraps slide body HTML into a full HTML document at the correct dimensions.
 * This is THE shared rendering contract between preview (iframe) and export (Puppeteer).
 */
export function wrapSlideHtml(
  slideHtml: string,
  aspectRatio: AspectRatio,
  options?: { inlineFontCss?: string }
): string {
  const { width, height } = DIMENSIONS[aspectRatio];
  const fontFamilies = extractFontFamilies(slideHtml);

  let fontBlock = "";
  if (options?.inlineFontCss) {
    // For export: use inlined base64 @font-face CSS
    fontBlock = `<style>${options.inlineFontCss}</style>`;
  } else if (fontFamilies.length > 0) {
    // For preview: use Google Fonts CDN link
    const params = fontFamilies.map(buildGoogleFontsFamilyParam).join("&");
    fontBlock = `<link href="https://fonts.googleapis.com/css2?${params}&display=swap" rel="stylesheet">`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  ${fontBlock}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  </style>
</head>
<body>
  ${slideHtml}
</body>
</html>`;
}
