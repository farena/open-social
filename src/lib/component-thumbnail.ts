import puppeteer from "puppeteer";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { interpolate } from "./component-interpolation";
import { extractFontFamilies, buildGoogleFontsFamilyParam } from "./slide-html";
import type { Component } from "@/types/component";

const THUMB_DIR = path.resolve(process.cwd(), "public/uploads/component-thumbs");

function wrapComponentHtml(
  html: string,
  css: string,
  width: number,
  height: number,
): string {
  const fontFamilies = extractFontFamilies(`${html}\n${css}`);
  let fontBlock = "";
  if (fontFamilies.length > 0) {
    const params = fontFamilies.map(buildGoogleFontsFamilyParam).join("&");
    fontBlock = `<link href="https://fonts.googleapis.com/css2?${params}&display=swap" rel="stylesheet">`;
  }

  const safeCss = (css ?? "").replace(/<\/style/gi, "");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  ${fontBlock}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body { ${safeCss} }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

function buildDefaultParams(component: Component): Record<string, string> {
  const params: Record<string, string> = {};
  for (const p of component.parametersSchema) {
    params[p.key] = p.defaultValue ?? "";
  }
  return params;
}

export async function generateComponentThumbnail(
  component: Component,
): Promise<string> {
  const publicPath = `/uploads/component-thumbs/${component.id}.png`;

  try {
    const params = buildDefaultParams(component);
    const interpolatedHtml = interpolate(component.htmlContent, params);
    const interpolatedCss = interpolate(component.scssStyles, params);
    const fullHtml = wrapComponentHtml(
      interpolatedHtml,
      interpolatedCss,
      component.width,
      component.height,
    );

    await mkdir(THUMB_DIR, { recursive: true });

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    try {
      await page.setViewport({
        width: component.width,
        height: component.height,
        deviceScaleFactor: 1,
      });
      await page.setContent(fullHtml, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.evaluate(() => document.fonts.ready).catch(() => {});

      const screenshotBuffer = await page.screenshot({
        type: "png",
        clip: {
          x: 0,
          y: 0,
          width: component.width,
          height: component.height,
        },
        captureBeyondViewport: false,
      });

      const destPath = path.join(THUMB_DIR, `${component.id}.png`);
      await writeFile(destPath, Buffer.from(screenshotBuffer as Uint8Array));
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }

    // Persist thumbnail_url via a direct DB call — avoid circular import
    // by using dynamic import to break the cycle at runtime.
    const { updateComponent } = await import("./components");
    await updateComponent(component.id, { thumbnailUrl: publicPath });
  } catch (err) {
    console.error(
      `[component-thumbnail] Failed to generate thumbnail for ${component.id}:`,
      err,
    );
    return publicPath;
  }

  return publicPath;
}
