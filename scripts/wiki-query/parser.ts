import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import matter from "gray-matter";
import type { Page } from "./types.js";

/**
 * Parse a wiki markdown file into a Page object.
 *
 * @param absPath  Absolute path to the markdown file.
 * @param repoRoot Absolute path to the repository root (used to compute the relative path).
 * @returns        Parsed Page with posix-relative path, frontmatter data, and body text.
 * @throws         Error if the file has no frontmatter (empty data object).
 */
// The wiki uses flow sequences for list-valued frontmatter (e.g.
// `code_refs: [src/app/api/content/[id]/generate/route.ts, ...]`). The literal
// `[id]` is a Next.js dynamic-route segment, not a YAML nested list, but YAML's
// flow grammar reads `[` as the start of a sequence and bails. Convert any
// flow-sequence line to a block sequence with quoted scalars before parsing.
function preprocessFrontmatter(raw: string): string {
  return raw.replace(/^---\n([\s\S]*?)\n---/m, (_match, fm: string) => {
    const fixed = fm.replace(
      /^(\s*)([A-Za-z_][\w-]*):\s*\[(.*)\]\s*$/gm,
      (_l, indent: string, key: string, inner: string) => {
        const parts: string[] = [];
        let depth = 0;
        let current = "";
        for (const ch of inner) {
          if (ch === "[") depth++;
          else if (ch === "]") depth--;
          if (ch === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
        }
        if (current.trim()) parts.push(current.trim());
        const block = parts
          .map((p) => `${indent}  - "${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
          .join("\n");
        return `${indent}${key}:\n${block}`;
      }
    );
    return `---\n${fixed}\n---`;
  });
}

export function parsePage(absPath: string, repoRoot: string): Page {
  const raw = nodeFs.readFileSync(absPath, "utf8");
  const matterResult = matter(preprocessFrontmatter(raw));

  if (Object.keys(matterResult.data).length === 0) {
    throw new Error(`parsePage: no frontmatter found in file: ${absPath}`);
  }

  const relativePath = nodePath
    .relative(repoRoot, absPath)
    .split(nodePath.sep)
    .join("/");

  return {
    path: relativePath,
    frontmatter: matterResult.data,
    body: matterResult.content,
  };
}
