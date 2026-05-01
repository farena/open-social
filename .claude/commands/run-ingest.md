---
description: Review project changes since the last wiki ingest and update the wiki accordingly.
argument-hint: [--since <git-ref>] [--dry-run]
allowed-tools: Bash(git *), Bash(grep *), Bash(test *), Bash(ls *), Bash(cat *), Read, Write, Edit, Glob, Grep
---

You are running an automated wiki ingest over the project's recent code changes. The `project-wiki` skill defines the page conventions and hard rules — follow them. This command is the **code-side** counterpart to manual decision/incident ingests.

## Snapshot

- Wiki present: !`test -d wiki && echo YES || echo NO`
- Last ingest marker: !`grep -m1 '^last-ingest-commit:' wiki/log.md 2>/dev/null || echo "MISSING"`
- HEAD: !`git rev-parse HEAD 2>/dev/null || echo MISSING`
- HEAD short: !`git rev-parse --short HEAD 2>/dev/null`
- Working tree clean: !`git diff-index --quiet HEAD -- && echo YES || echo NO`

User-supplied args: $ARGUMENTS

## Steps

1. **Bail out early if the wiki is missing.** If `wiki/` does not exist, tell the user to invoke the `project-wiki` skill first to scaffold it, then stop.

2. **Resolve the diff window.**
   - If `$ARGUMENTS` contains `--since <ref>`, use `<ref>` as `BASE`.
   - Else parse `last-ingest-commit:` from `wiki/log.md`. If present and non-empty, use it as `BASE`.
   - Else (first run): use the empty tree (`git rev-parse HEAD~50` if available, else the root commit). Tell the user this is a first-run cold-start ingest and that you'll cap scope to the last 50 commits to keep it tractable.
   - `HEAD_SHA` = current HEAD.
   - If `BASE == HEAD_SHA`, report "wiki is up to date" and stop.

3. **Detect dry-run.** If `$ARGUMENTS` contains `--dry-run`, you must NOT write files; only report what would change.

4. **Survey the changes.** Run, in parallel:
   - `git log --no-merges --pretty=format:'%h %s' BASE..HEAD` — commit list.
   - `git diff --stat BASE..HEAD` — files touched + churn.
   - `git diff --name-status BASE..HEAD` — adds/renames/deletes.

5. **Cluster commits into ingest units.** Group by *meaningful change*, not by commit. A unit is one of:
   - **New entity** — a new file or module under `src/` that warrants an `entities/` page (e.g. a new API route, lib module, type).
   - **Renamed/moved entity** — existing entity page needs `code_refs` updated and a note appended.
   - **Removed entity** — entity page should be marked deprecated (or deleted if it never had decision context worth keeping).
   - **Behavioral / contract change** — touches an existing entity in a way that contradicts current page text (e.g. response shape changed, defaults changed, sandbox flags changed). Page body needs updating.
   - **New concept** — a pattern emerges across several files (e.g. a new caching layer, a new auth flow). Warrants a `concepts/` page.
   - **Decision-bearing commit** — commit message or PR body explains *why* (alternatives, constraints, tradeoffs). This is the ONLY case where you create a `wiki/raw/decisions/<slug>-YYYY-MM-DD.md` entry. Use the commit SHA as the source link.
   - **Incident-bearing commit** — fixes a notable bug with a clear postmortem narrative in the message. Create `wiki/raw/incidents/<slug>-YYYY-MM-DD.md`.

   Skip clusters that are pure mechanical work: dependency bumps without behavior change, formatting, comment tweaks, doc-only changes outside `wiki/`, and changes to `wiki/` itself.

6. **Confirm scope before writing** (skip if `--dry-run`). Print a short plan:
   - N commits in window `BASE..HEAD_SHA`.
   - K ingest units: list each with one line (type + slug + 1-line rationale).
   - Files in `wiki/raw/` to be created (decisions + incidents only).
   - Pages in `wiki/pages/` to be created or modified.

   If more than ~15 units, ask the user whether to proceed in batches or narrow the window. Otherwise proceed.

7. **Apply changes.** For each unit:
   - **Decision/incident** → write the `raw/` entry. Keep it short: context, decision/outcome, alternatives, link to commit SHA, related code paths. Never paste code; cite paths.
   - **Page touches** → create or edit the affected `pages/entities/*` or `pages/concepts/*`. Update `code_refs` to current paths. Bump `updated:` to today. Add a "Recent changes" line at the bottom of the body referencing the commit short SHA, e.g.: `- 2026-04-29 (\`a1b2c3d\`) — switched SSE framing to length-prefixed events.` Keep this list capped at the most recent ~5 entries; older ones can be pruned.
   - **New page** → use the skill's frontmatter conventions, set `confidence: medium` (you derived it from code, not from a written decision), and ensure at least one `code_refs` entry.
   - Refuse to write code excerpts into `raw/` — only the *why*. If a unit has no clear "why", do not create a `raw/` entry; just update the page.

8. **Update `wiki/index.md`** with new/renamed pages.

9. **Update `wiki/log.md`:**
   - Replace the `last-ingest-commit:` header line with `last-ingest-commit: <HEAD_SHA>`. If the header is missing entirely, insert it at the top of the file.
   - Append a single line: `## [YYYY-MM-DD] run-ingest | BASE_SHORT..HEAD_SHORT — U units, P pages touched, R raw entries` (where `BASE_SHORT`/`HEAD_SHORT` are 7-char SHAs).

10. **Commit the ingest** (skip if `--dry-run` or if no files under `wiki/` were modified):
    - Stage only paths under `wiki/` (e.g. `git add wiki/`). Do NOT stage anything outside the wiki — if other files are dirty, leave them untouched.
    - Run `git status --porcelain wiki/` to confirm what will be committed; if empty, skip the commit.
    - Create a new commit (never amend) with a HEREDOC message in this shape:
      ```
      docs(wiki): ingest BASE_SHORT..HEAD_SHORT — U units, P pages, R raw

      <one-line-per-unit summary, max ~10 lines>

      Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
      ```
    - If the pre-commit hook fails, fix the issue, re-stage, and create a NEW commit (do not use `--amend` or `--no-verify`).
    - Do NOT push.

11. **Report to the user.** A compact summary:
    - Window: `BASE_SHORT..HEAD_SHORT` (N commits).
    - Pages created / modified (counts + list).
    - Decisions / incidents added (list).
    - Units intentionally skipped and why (1-line each, max 5).
    - 2-3 suggestions of follow-up: missing decision context to capture manually, pages that look stale and should be linted, etc.
    - The new commit SHA (or "no commit — no wiki changes" / "no commit — dry-run").

## Hard rules

- **Never copy code into `wiki/raw/`.** Reference paths only. The `project-wiki` skill enforces this and so does this command.
- **Never mutate existing `wiki/raw/` files.** New decisions supersede; old ones stay.
- **Never advance `last-ingest-commit:` on `--dry-run`.**
- **Skip your own changes.** If commits in the window are wiki-only (paths under `wiki/` or `.claude/`), drop them from the survey before clustering.
- **One commit, many units OR many commits, one unit.** Don't assume 1:1 — feature work spans commits and refactor commits often touch unrelated areas.
- If the working tree is dirty (snapshot says NO), warn once but proceed — uncommitted work is not in the window.

Stay terse. The wiki is the artifact; chat is ephemeral.
