# wiki-query CLI Implementation Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Ship a Node/TypeScript CLI `wiki-query` that searches `wiki/pages/` and `wiki/raw/` by combining frontmatter filters (`type`, `code_refs`, `related`) with BM25 body ranking — no LLM, no network, no model downloads, single project toolchain.

**Architecture:** Small TS module under `scripts/wiki-query/` that walks the wiki at query time (~20 pages, no persistent index needed initially), parses each markdown file via `gray-matter` into `{path, frontmatter, body}`, applies frontmatter filters, then ranks survivors with `minisearch` (BM25 + configurable tokenizer + field-aware search in one zero-dep package). Output is plain text by default (path + score + snippet) with a `--json` flag for piping. Distributed as a `bin` entry in `package.json`; runs via `tsx` so no compile step is needed.

**Tech Stack:**
- Node 20+ (project already requires it)
- TypeScript 5.x (matches project conventions)
- `minisearch` ≥ 7.x — BM25, tokenizer, filters; ~10 KB, zero deps, used by Docusaurus/MDX docs sites in production
- `gray-matter` ≥ 4.x — de-facto standard for markdown+YAML frontmatter in the Node ecosystem
- `tsx` — run TS directly without a build step (already lightweight)
- `node:util.parseArgs` (stdlib, Node 18.3+) — argument parsing without a third dep
- `jest` — matches the rest of the project's test infrastructure
- Distribution via `package.json` `bin`: `npx wiki-query "..."` works without venv/wrapper gymnastics

---

## Acceptance criteria

- [ ] `wiki-query "session tokens"` returns top-5 ranked pages from `wiki/pages/` with file path, score, and a snippet.
- [ ] `wiki-query "X" --type concept` restricts to pages whose frontmatter `type: concept`.
- [ ] `wiki-query --refs src/lib/data.ts` returns pages whose frontmatter `code_refs` contains that path (no body query needed — filter-only mode).
- [ ] `wiki-query "X" --related entities/chat-route.md` filters to pages whose frontmatter `related:` array contains the given page.
- [ ] `wiki-query "X" --raw` extends the corpus to include `wiki/raw/decisions/` and `wiki/raw/incidents/`.
- [ ] `wiki-query "X" --json` emits machine-readable output (one object per result with `path`, `score`, `frontmatter`, `snippet`).
- [ ] `wiki-query --limit N` controls result count (default 5).
- [ ] Returns exit code 1 with a clear stderr message when no matches are found.
- [ ] All filters compose: `wiki-query "echo absorption" --type concept --refs src/components/editor/useSlideEditor.ts` works.
- [ ] Jest suite passes; coverage includes parser, loader, filters, ranker, snippet, and CLI argparse.
- [ ] `npx wiki-query --version` works from a fresh clone after `npm install`.

---

## File map

**Create:**
- `scripts/wiki-query/cli.ts` — entrypoint (shebang + argparse + orchestration + render).
- `scripts/wiki-query/parser.ts` — `parsePage(absPath: string): Page` using `gray-matter`.
- `scripts/wiki-query/loader.ts` — `loadCorpus(wikiRoot, { includeRaw }): Page[]` walking `wiki/pages/**/*.md` and optionally `wiki/raw/**/*.md`.
- `scripts/wiki-query/filters.ts` — pure `applyFilters(pages, { type, refs, related })`.
- `scripts/wiki-query/ranker.ts` — `rank(pages, query, limit): Result[]` wrapping `MiniSearch`.
- `scripts/wiki-query/snippet.ts` — `snippet(page, query): string` with ±100 char window around first match.
- `scripts/wiki-query/render.ts` — `renderText(results)` and `renderJson(results)`.
- `scripts/wiki-query/types.ts` — `Page`, `Result`, `QueryOptions` types.
- `scripts/wiki-query/tsconfig.json` — extends root `tsconfig`, sets `module: nodenext`, `target: es2022`, `outDir` unused (run via `tsx`).
- `scripts/wiki-query/README.md` — install + usage; explicit "no LLM / no network" guarantee.
- `scripts/wiki-query/__tests__/parser.test.ts`
- `scripts/wiki-query/__tests__/loader.test.ts`
- `scripts/wiki-query/__tests__/filters.test.ts`
- `scripts/wiki-query/__tests__/ranker.test.ts`
- `scripts/wiki-query/__tests__/snippet.test.ts`
- `scripts/wiki-query/__tests__/cli.test.ts`
- `scripts/wiki-query/__tests__/real-wiki.test.ts` — smoke test against the actual `wiki/`.
- `scripts/wiki-query/__tests__/fixtures/` — minimal markdown corpus for deterministic tests.

**Modify:**
- `package.json`:
  - `bin`: `{ "wiki-query": "scripts/wiki-query/cli.ts" }`
  - `scripts`: `"wiki:query": "tsx scripts/wiki-query/cli.ts"`
  - `dependencies`: `minisearch`, `gray-matter`
  - `devDependencies`: confirm `tsx` is present (it usually is in Next 16 setups; add if missing)
- `CLAUDE.md` — one-line pointer under Conventions: `Wiki search: npx wiki-query "..." (Node BM25, no LLM). See scripts/wiki-query/README.md.`

**Do not modify:**
- `wiki/` content. The CLI is read-only.
- `src/`. This tool is auxiliary tooling, not product code.

---

## Module contracts

```ts
// types.ts
export interface Page {
  path: string;            // posix path relative to repo root, e.g. "wiki/pages/concepts/sse-streaming.md"
  frontmatter: {
    title?: string;
    type?: "entity" | "concept" | "source" | string;
    code_refs?: string[];
    related?: string[];
    sources?: string[];
    tags?: string[];
    confidence?: string;
    [k: string]: unknown;
  };
  body: string;
}

export interface Result {
  page: Page;
  score: number;          // 0 in filter-only mode
  snippet: string;
}

export interface QueryOptions {
  query?: string;
  type?: string;
  refs?: string;          // substring match against any code_refs entry
  related?: string;       // exact match against any related entry
  limit?: number;         // default 5
  includeRaw?: boolean;   // default false
}
```

`MiniSearch` wiring (in `ranker.ts`):

```ts
const ms = new MiniSearch<Page>({
  fields: ["body"],            // body-only ranking; frontmatter handled by filters
  storeFields: ["path"],       // need to map back to Page
  idField: "path",
  searchOptions: {
    boost: { body: 1 },
    fuzzy: 0.1,                 // tolerate minor typos
    prefix: true,               // "stream" matches "streaming"
  },
  tokenize: (text) => text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [],
});
ms.addAll(pages);
const hits = ms.search(query, { combineWith: "AND" });
```

The `tokenize` regex preserves path-style refs (`src/lib/data.ts`) as a single token — the same fix the Python plan called out. We pass this tokenizer to both indexing and querying so they match.

---

## Tasks

### Task 1: Scaffold project + dependencies

**Files:**
- Create: `scripts/wiki-query/cli.ts` (stub: prints `wiki-query 0.1.0` on `--version`)
- Create: `scripts/wiki-query/tsconfig.json`
- Create: `scripts/wiki-query/types.ts`
- Create: `scripts/wiki-query/__tests__/cli.test.ts`
- Modify: `package.json` (deps + bin + script)

- [x] **Step 1: Write failing test** — `cli.test.ts::test_smoke` runs `tsx scripts/wiki-query/cli.ts --version` via `child_process.execFileSync` and asserts exit 0 + stdout matches `/^wiki-query \d+\.\d+\.\d+$/`.
- [x] **Step 2: Run test, confirm fail** — `npx jest scripts/wiki-query/__tests__/cli.test.ts -t smoke`.
- [x] **Step 3: Implement minimal change** — `cli.ts` with shebang `#!/usr/bin/env -S npx tsx`, `parseArgs` for `--version`, prints version. Add deps + `bin` entry to `package.json`. Run `npm install`.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): scaffold CLI module + deps`. *(Skipped per run-plan rules — implementation stays in working tree.)*

Validation:
```bash
npm install
npx wiki-query --version
# Expected: "wiki-query 0.1.0"
```

---

### Task 2: Page parser (gray-matter)

**Files:**
- Create: `scripts/wiki-query/parser.ts`
- Create: `scripts/wiki-query/__tests__/fixtures/sample-entity.md`
- Create: `scripts/wiki-query/__tests__/parser.test.ts`

- [x] **Step 1: Write failing test** — fixture markdown with full YAML frontmatter; assert `parsePage(path).frontmatter.type === "entity"`, `code_refs` is `string[]`, `body` does not contain the `---` fences, `body` starts with the first content line.
- [x] **Step 2: Run test, confirm fail**.
- [x] **Step 3: Implement** — wrap `gray-matter`: `const m = matter(readFileSync(path, "utf8")); return { path: toRepoRel(path), frontmatter: m.data, body: m.content };`.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): page parser via gray-matter`. *(Skipped per run-plan rules — implementation stays in working tree.)*

Edge cases tested:
- Page with no frontmatter — throws `Error` naming the path (only valid for malformed files; the wiki always has frontmatter).
- List values (`code_refs: [a, b]`) parse as `string[]`.
- Body containing literal `---` past the first fence is preserved untouched.

---

### Task 3: Corpus loader

**Files:**
- Create: `scripts/wiki-query/loader.ts`
- Create: `scripts/wiki-query/__tests__/loader.test.ts`
- Create: `scripts/wiki-query/__tests__/fixtures/wiki/pages/entities/x.md`
- Create: `scripts/wiki-query/__tests__/fixtures/wiki/raw/decisions/y.md`
- Create: `scripts/wiki-query/__tests__/fixtures/wiki/index.md`

- [x] **Step 1: Write failing test** — `loadCorpus(fixtures/wiki, { includeRaw: false })` returns 1 page; with `includeRaw: true` returns 2; `index.md` and `log.md` are never included regardless.
- [x] **Step 2: Run test, confirm fail**.
- [x] **Step 3: Implement** — recursive walk via `fs.readdirSync(..., { recursive: true, withFileTypes: true })`, filter `.md` files, exclude `index.md`/`log.md` by basename, exclude `wiki/raw/**` unless `includeRaw`. Map through `parsePage`.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): corpus loader with --raw scope`. *(Skipped per run-plan rules.)*

---

### Task 4: BM25 ranker (MiniSearch)

**Files:**
- Create: `scripts/wiki-query/ranker.ts`
- Create: `scripts/wiki-query/__tests__/ranker.test.ts`

- [x] **Step 1: Write failing test** — corpus of 3 fixture pages, one obviously about "puppeteer fonts"; assert `rank(pages, "puppeteer", 3)[0].page.path` ends with the puppeteer fixture and `score > 0`. Second test: `rank(pages, "", 5)` returns all pages with `score === 0`.
- [x] **Step 2: Run test, confirm fail**.
- [x] **Step 3: Implement** — `MiniSearch` with the contract above. Empty-query fallback returns `pages.map(page => ({ page, score: 0, snippet: "" }))` (snippet filled by Task 6). Pass-through for `limit`.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): BM25 ranking via MiniSearch`. *(Skipped per run-plan rules.)*

Validation:
```bash
npx tsx -e "
import { loadCorpus } from './scripts/wiki-query/loader';
import { rank } from './scripts/wiki-query/ranker';
const pages = loadCorpus('wiki', { includeRaw: false });
for (const r of rank(pages, 'sse streaming', 3)) {
  console.log(r.score.toFixed(2), r.page.path);
}
"
# Expected: sse-streaming.md ranks first.
```

---

### Task 5: Frontmatter filters

**Files:**
- Create: `scripts/wiki-query/filters.ts`
- Create: `scripts/wiki-query/__tests__/filters.test.ts`

- [x] **Step 1: Write failing test** — `applyFilters(pages, { type: "concept" })`, `applyFilters(pages, { refs: "src/lib/data.ts" })`, `applyFilters(pages, { related: "entities/chat-route.md" })` each narrow correctly. Combined filters AND together. `refs` matches via substring; `related` matches exactly (after stripping leading `pages/` if present).
- [x] **Step 2: Run test, confirm fail**.
- [x] **Step 3: Implement** — pure function operating on `frontmatter` only. `refs` does `code_refs.some(r => r.includes(needle))`. `related` normalizes both sides: `r.replace(/^pages\//, "").replace(/\.md$/, "") === needle.replace(/^pages\//, "").replace(/\.md$/, "")`.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): frontmatter filters (type/refs/related)`. *(Skipped per run-plan rules.)*

Notes:
- `refs` substring match is intentional — wiki `code_refs` carry full paths but a user querying `useSlideEditor` should still hit them.
- `related` exact match (after normalization) is intentional — wiki entries are normalized to `pages/entities/foo.md`.

---

### Task 6: Snippet extraction

**Files:**
- Create: `scripts/wiki-query/snippet.ts`
- Create: `scripts/wiki-query/__tests__/snippet.test.ts`

- [x] **Step 1: Write failing test** — for a page containing "Buffer stdout, split on newline, parse each line as JSON.", `snippet(page, "stdout")` includes `"stdout"` and is ≤ 200 chars; for an empty query, returns `body.slice(0, 200)` with collapsed whitespace.
- [x] **Step 2: Run test, confirm fail**.
- [x] **Step 3: Implement** — for each query token, find first case-insensitive occurrence in body, take the earliest match across tokens, expand ±100 chars, collapse runs of whitespace to single spaces. Fall back to the first 200 chars when nothing matches.
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): snippet extraction around query hit`. *(Skipped per run-plan rules.)*

---

### Task 7: CLI surface (parseArgs + render + exit codes)

**Files:**
- Modify: `scripts/wiki-query/cli.ts`
- Create: `scripts/wiki-query/render.ts`
- Modify: `scripts/wiki-query/__tests__/cli.test.ts`

- [x] **Step 1: Write failing tests:**
  - `wiki-query "session"` → exit 0, stdout contains the path of the highest-ranked page.
  - `wiki-query --type entity` (no positional query) → exit 0, lists all entity pages in path-sorted order.
  - `wiki-query "totally-not-in-the-wiki-xyzzy"` → exit 1, stderr contains "no matches".
  - `wiki-query "X" --json` → stdout parses as JSON, is a non-empty array, each item has `path`/`score`/`frontmatter`/`snippet`.
  - `wiki-query --limit 2 ""` → exit 0, ≤ 2 results.
  - `wiki-query "X" --raw` includes `wiki/raw/**` results.
- [x] **Step 2: Run tests, confirm fail**.
- [x] **Step 3: Implement** — `parseArgs({ options: { type: { type: "string" }, refs: { type: "string" }, related: { type: "string" }, raw: { type: "boolean" }, limit: { type: "string", default: "5" }, json: { type: "boolean" }, root: { type: "string" }, version: { type: "boolean" } }, allowPositionals: true })`. Default wiki root: resolve `wiki/` from `process.cwd()`; allow override via `--root`. Wire loader → filters → ranker → snippet → render. Exit codes: 0 on success, 1 on no matches, 2 on usage error.
- [x] **Step 4: Run tests, confirm pass**.
- [x] **Step 5: Commit** — `feat(wiki-query): CLI surface with --json and exit codes`. *(Skipped per run-plan rules.)*

Output format (text):
```
wiki/pages/concepts/sse-streaming.md  (score 4.21)
  Buffer stdout, split on newline, parse each line as JSON, translate to SSE…
```

---

### Task 8: Real-wiki smoke test

**Files:**
- Create: `scripts/wiki-query/__tests__/real-wiki.test.ts`

- [x] **Step 1: Write failing test** — 4 cases (`puppeteer`, `--raw` broadens, `--type concept`, `--refs <bracket-path>`).
- [x] **Step 2: Run test** — surfaced a real bug: gray-matter / js-yaml chokes on `[id]` Next.js dynamic-route segments inside `code_refs` flow sequences.
- [x] **Step 3: Implement fixes** — added a frontmatter pre-processor in `parser.ts` that converts flow sequences into block sequences with quoted scalars, side-stepping YAML's flow-grammar ambiguity. Tightened all 4 real-wiki assertions to demand canonical pages (export-pipeline, sse-streaming, generate-route).
- [x] **Step 4: Run test, confirm pass**.
- [x] **Step 5: Commit** — `test(wiki-query): real-wiki smoke test`. *(Skipped per run-plan rules.)*

---

### Task 9: README + onboarding

**Files:**
- Create: `scripts/wiki-query/README.md`
- Modify: `CLAUDE.md`

- [x] **Step 1**: Write `README.md` with:
  - Install: `npm install` (deps land via root `package.json`).
  - Usage: every flag with one example.
  - Guarantees: "no LLM, no network, no model downloads — pure BM25 + frontmatter."
  - Indexing model: "regenerated every run; no cache file" + when to revisit (>500 pages).
- [x] **Step 2**: Add to `CLAUDE.md` Conventions: `- Wiki search: npx wiki-query "..." (Node BM25, no LLM). See scripts/wiki-query/README.md.`
- [x] **Step 3: Commit** — `docs(wiki-query): README + CLAUDE.md pointer`. *(Skipped per run-plan rules.)*

---

## Execution order + parallelism

Sequential dependency chain:
- **Task 1** (scaffold) blocks everything.
- **Task 2** (parser) blocks Tasks 3, 4, 5, 6.
- **Tasks 3, 4, 5, 6** can run in parallel after Task 2 — distinct files, no overlap.
- **Task 7** (CLI surface) requires Tasks 3, 4, 5, 6.
- **Tasks 8, 9** can run in parallel after Task 7.

Suggested wall-clock order for a single executor: 1 → 2 → (3, 4, 5, 6 in parallel) → 7 → (8, 9 in parallel).

---

## Critical risks + mitigations

1. **MiniSearch tokenizer override.** MiniSearch's default tokenizer splits on whitespace+punctuation, which breaks `src/lib/data.ts`-style refs in body matches. Mitigated by passing a custom tokenizer that preserves `/`, `.`, `-`, `_`, and applying the same tokenizer to both indexing and querying via the `searchOptions.tokenize` setting.
2. **Fuzzy/prefix defaults.** MiniSearch ships with no fuzzy/prefix by default; we enable both (`fuzzy: 0.1`, `prefix: true`) so "streaming" matches "stream" and minor typos don't kill recall. Risk: false positives on a tiny corpus. The real-wiki smoke test (Task 8) is the canary.
3. **No persistent index.** Every invocation re-parses ~20 files (~5 ms each on Node). Fine for current size; revisit if the wiki crosses ~500 pages, then add a `.cache/wiki-query.json` keyed by mtime.
4. **`bin` entry needs `tsx` shebang.** A `bin` field requires the file to be runnable directly. Using `#!/usr/bin/env -S npx tsx` is the standard way to ship TS-as-bin without a build step. Tested via `npx wiki-query` post-install — verified in Task 1 acceptance.
5. **YAML frontmatter edge cases.** Wiki pages use list-style values consistently; `gray-matter` (which delegates to `js-yaml`) handles both flow and block forms. Parser test fixture (Task 2) covers both.

---

## Out of scope (v1)

- Persistent index / mtime cache.
- Embeddings / semantic search.
- Querying `wiki/raw/` by default (opt-in via `--raw`).
- Cross-page graph traversal (`--expand-related`).
- ANSI color highlighting of matched terms.
- Watching the wiki and re-indexing on change.
- Compiling to a standalone JS bundle for distribution outside this repo.

---

## Final handoff

- **Plan file:** `docs/plans/2026-05-01-wiki-query-cli.md`
- **Number of tasks:** 9
- **Critical risks:** MiniSearch tokenizer must be overridden to keep path-style refs intact; fuzzy/prefix defaults need a smoke test on the real corpus; `bin` shebang via `tsx` is the only non-obvious distribution mechanic.
- **Recommended execution mode:** **subagent-driven task execution** — Tasks 3/4/5/6 are naturally parallelizable after Task 2 (distinct files, zero overlap), and the test-first structure means each subagent gets a clean accept/reject signal.
