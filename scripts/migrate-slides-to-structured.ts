/**
 * One-shot migration: legacy `slide.html` strings → structured model.
 *
 * Usage:
 *   npx tsx scripts/migrate-slides-to-structured.ts            # runs migration
 *   npx tsx scripts/migrate-slides-to-structured.ts --dry-run  # report only
 *
 * Always backs up data/carousels.json before writing.
 */

import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtmlToSlide } from "../src/lib/slide-migrator.ts";
import type { ParsedSlide } from "../src/lib/slide-migrator.ts";
import type { AspectRatio } from "../src/types/carousel.ts";

interface LegacySlide {
  id: string;
  html?: string;
  previousVersions?: (string | unknown)[];
  order: number;
  notes: string;
  // May already have new fields if the file was partially migrated
  background?: unknown;
  elements?: unknown;
  legacyHtml?: string;
}

interface LegacyCarousel {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  slides: LegacySlide[];
  [key: string]: unknown;
}

interface LegacyCarouselsFile {
  carousels: LegacyCarousel[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "..", "data", "carousels.json");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  let raw: string;
  try {
    raw = await readFile(DATA_FILE, "utf8");
  } catch (err) {
    console.error(`Could not read ${DATA_FILE}:`, (err as Error).message);
    process.exit(1);
  }

  const data: LegacyCarouselsFile = JSON.parse(raw);

  let totalSlides = 0;
  let parsedClean = 0;
  let parsedWithLegacy = 0;
  let alreadyStructured = 0;

  for (const carousel of data.carousels) {
    for (const slide of carousel.slides) {
      totalSlides++;

      // Skip if already structured
      if (
        slide.background !== undefined &&
        slide.elements !== undefined &&
        slide.html === undefined
      ) {
        alreadyStructured++;
        continue;
      }

      const ratio = carousel.aspectRatio;
      const parsed: ParsedSlide = slide.html
        ? parseHtmlToSlide(slide.html, ratio)
        : { background: { kind: "solid", color: "#ffffff" }, elements: [] };

      if (parsed.legacyHtml) parsedWithLegacy++;
      else parsedClean++;

      if (!dryRun) {
        slide.background = parsed.background;
        slide.elements = parsed.elements;
        if (parsed.legacyHtml) {
          slide.legacyHtml = parsed.legacyHtml;
        } else {
          delete slide.legacyHtml;
        }
        delete slide.html;

        // Migrate previousVersions: string[] → SlideSnapshot[]
        const oldVersions = slide.previousVersions ?? [];
        slide.previousVersions = oldVersions.map((v) => {
          if (typeof v === "string") {
            const versionParsed = parseHtmlToSlide(v, ratio);
            return {
              background: versionParsed.background,
              elements: versionParsed.elements,
              ...(versionParsed.legacyHtml
                ? { legacyHtml: versionParsed.legacyHtml }
                : {}),
            };
          }
          return v; // already a snapshot
        });
      }
    }
  }

  console.log(`Slides total           : ${totalSlides}`);
  console.log(`  parsed cleanly       : ${parsedClean}`);
  console.log(`  preserved as legacy  : ${parsedWithLegacy}`);
  console.log(`  already structured   : ${alreadyStructured}`);

  if (dryRun) {
    console.log("\n--dry-run: no files written.");
    return;
  }

  // Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = DATA_FILE.replace(/\.json$/, `.legacy-${stamp}.json`);
  await copyFile(DATA_FILE, backupPath);
  console.log(`\nBackup: ${path.relative(process.cwd(), backupPath)}`);

  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote:  ${path.relative(process.cwd(), DATA_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
