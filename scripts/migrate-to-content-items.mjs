#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = new URL("../data/", import.meta.url).pathname;
const CAROUSELS_PATH = path.join(DATA_DIR, "carousels.json");
const BACKUP_PATH = path.join(DATA_DIR, "carousels.json.pre-open-social-pivot.bak");
const OUTPUT_PATH = path.join(DATA_DIR, "content-items.json");

function extractFirstText(elements) {
  if (!Array.isArray(elements)) return "";
  for (const el of elements) {
    if (el.kind !== "container") continue;
    const html = el.htmlContent;
    if (!html) continue;
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.slice(0, 80);
  }
  return "";
}

async function main() {
  const outputExists = await fs.access(OUTPUT_PATH).then(() => true).catch(() => false);
  if (outputExists) {
    process.stderr.write(
      `file already exists; aborting to avoid clobbering. Delete it first if you really want to re-migrate.\n`
    );
    process.exit(1);
  }

  const raw = await fs.readFile(CAROUSELS_PATH, "utf8");
  const { carousels } = JSON.parse(raw);

  await fs.copyFile(CAROUSELS_PATH, BACKUP_PATH);
  process.stdout.write(`backup → ${BACKUP_PATH}\n`);

  const contentItems = carousels.map((carousel) => {
    const firstSlide = carousel.slides?.[0];
    const hook = extractFirstText(firstSlide?.elements);

    return {
      id: carousel.id,
      type: "carousel",
      state: "generated",
      hook,
      bodyIdea: carousel.notes ?? "",
      caption: carousel.caption ?? "",
      hashtags: carousel.hashtags ?? [],
      aspectRatio: carousel.aspectRatio,
      slides: carousel.slides,
      chatSessionId: carousel.chatSessionId ?? null,
      referenceImages: carousel.referenceImages ?? [],
      assets: carousel.assets ?? [],
      tags: carousel.tags ?? [],
      createdAt: carousel.createdAt,
      updatedAt: carousel.updatedAt,
      generatedAt: carousel.createdAt,
    };
  });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ contentItems }, null, 2), "utf8");

  process.stdout.write(`migrated ${contentItems.length} items\n`);
  process.stdout.write(`✅ wrote ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
