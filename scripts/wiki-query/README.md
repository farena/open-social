# wiki-query

## What it is

`wiki-query` is a command-line BM25 search tool over the project wiki. It indexes `wiki/pages/` (and optionally `wiki/raw/`) at query time, ranks results using the MiniSearch library, and prints matching page titles, paths, and body snippets. It is written in TypeScript and runs directly with `tsx`. There is no LLM, no network call, and no model download of any kind.

## Install

Run `npm install` from the repo root. No separate setup step is required; the binary is wired through the `bin` field in `package.json` and all dependencies come from the project's own `node_modules`.

## Usage

```
npx wiki-query "<query>" [options]
```

### Examples

```sh
# Basic text search
npx wiki-query "session tokens"

# Machine-readable JSON output (safe to pipe to jq, etc.)
npx wiki-query "session tokens" --json

# Restrict to a specific page type
npx wiki-query "session tokens" --type concept
npx wiki-query "session tokens" --type entity
npx wiki-query "session tokens" --type source

# List all pages whose code_refs mention a specific file (no query needed)
npx wiki-query --refs src/lib/data.ts

# Restrict results to pages whose related: array includes a given page
npx wiki-query "session tokens" --related entities/chat-route.md

# Extend the corpus to include wiki/raw/decisions/ and wiki/raw/incidents/
npx wiki-query "session tokens" --raw

# Return up to 10 results instead of the default 5
npx wiki-query "session tokens" --limit 10

# Override the default ./wiki root (useful when running from a different directory)
npx wiki-query "session tokens" --root /path/to/some/wiki

# Print the CLI version
npx wiki-query --version
```

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--type` | string | — | Filter by page type: `concept`, `entity`, or `source` |
| `--refs` | string | — | Filter to pages whose `code_refs` mention the given path |
| `--related` | string | — | Filter to pages whose `related:` array includes the given page |
| `--root` | string | `./wiki` | Override the wiki root directory |
| `--limit` | number | `5` | Maximum number of results to return |
| `--raw` | boolean | false | Include `wiki/raw/decisions/` and `wiki/raw/incidents/` in corpus |
| `--json` | boolean | false | Emit JSON instead of formatted text |
| `--version` | boolean | false | Print version and exit |

## Output format

**Text (default):**

```
[1] entities/chat-route.md  (score: 4.21)
    Chat API Route
    ...session tokens are validated on each request before the subprocess...
```

**JSON (`--json`):**

```json
[
  {
    "rank": 1,
    "score": 4.21,
    "path": "entities/chat-route.md",
    "title": "Chat API Route",
    "type": "entity",
    "snippet": "...session tokens are validated on each request before the subprocess..."
  }
]
```

JSON output is an array ordered by descending score, suitable for piping to `jq` or other tools.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | One or more results found and printed |
| `1` | No matches for the given query/filters |
| `2` | Usage error (unknown flag, invalid `--limit`, etc.) |

## Guarantees

- No LLM, no network, no model downloads. Runs fully offline.
- Indexed at query time; there is no cache file on disk. If the wiki ever exceeds roughly 500 pages and queries become slow, add an mtime-keyed cache — that is out of scope for v1.
- A frontmatter pre-processor handles Next.js dynamic-route paths in `code_refs` (e.g. `[id]`, `[slideId]`) by converting flow-sequence values to block sequences with quoted scalars before YAML parsing, so bracket paths do not break the parser.

## How it ranks

Results are ranked with MiniSearch BM25. The index is built over each page's body text. A custom tokenizer preserves path-relevant characters (`/`, `.`, `-`, `_`) so that references like `src/lib/data.ts` remain searchable as a unit. Queries use `fuzzy: 0.1` and `prefix: true` for tolerance against minor typos and partial words. Multi-word queries use `combineWith: AND`, which means each additional term narrows the result set rather than broadening it.

## Limitations

- Keyword-based only; there is no semantic or embedding-based matching.
- BM25 can behave noisily when the corpus is very small (fewer than ~10 pages); scores may not reflect intuitive relevance at that scale.
- `--related` requires an exact match after normalization (stripping a leading `pages/` prefix and a trailing `.md` suffix). Partial path matches are not supported.
- `--refs` matches substrings, so `src/lib/data.ts` will also match `src/lib/data.tsconfig` if such a path appeared in frontmatter.
