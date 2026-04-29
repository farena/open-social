

# Open Social

### Chat with Claude. Design Instagram content. Export pixel-perfect PNGs.

**Local-first. Open source. One command to start.**

[License: MIT](./LICENSE)
[Built with Claude](https://claude.ai)
[Next.js 16](https://nextjs.org)
[React 19](https://react.dev)
[TypeScript](https://www.typescriptlang.org)
[Tailwind v4](https://tailwindcss.com)

> Based on **[Hainrixz/open-carrusel](https://github.com/Hainrixz/open-carrusel)** — original work and design.



---

## Table of contents

- [Why Open Social](#-why-open-social)
- [Quickstart (60 seconds)](#-quickstart-60-seconds)
- [What you can do](#-what-you-can-do)
- [How the AI agent works](#-how-the-ai-agent-works)
- [Slash commands](#-slash-commands)
- [Architecture](#-architecture)
- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure)
- [Configuration](#%EF%B8%8F-configuration)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#%EF%B8%8F-roadmap)
- [Contributing](#-contributing)
- [Acknowledgments](#-acknowledgments)
- [License](#-license)

---

## ✨ Why Open Social

Designing Instagram content eats hours. You either:

- Pay $20–60/month for a closed-source tool that limits how creative you can get
- Wrestle Canva templates that everyone else also uses
- Hand-craft slides in Figma and lose your weekend

**Open Social takes a different bet.** You chat with Claude — the same model many designers already trust — and it generates real HTML/CSS slides that get screenshotted to PNGs at exact Instagram dimensions. Slides are unique, on-brand, and pixel-perfect. Everything runs on your laptop. Nothing is sent to a cloud you don't control.

It's open source under MIT. Fork it, tweak the system prompt, ship your own variant. No accounts. No subscriptions. No vendor lock-in.

---

## 🚀 Quickstart (60 seconds)

> First run takes 1–2 minutes (Puppeteer downloads ~300 MB of Chromium for PNG export). After that, every launch is seconds.

### One-command path (recommended)

1. **Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** and authenticate.
2. **Clone and open the repo** in Claude Code:
  ```bash
   git clone https://github.com/farena/open-social.git
   cd open-social
   claude
  ```
3. In the Claude Code prompt, type:
  ```
   /start
  ```

That's it. Dependencies install, the dev server starts, your browser opens. Now design content by chatting.

### Manual path (if you don't use Claude Code)

```bash
git clone https://github.com/farena/open-social.git
cd open-social
npm run setup        # installs deps + seeds /data/
npm run dev          # starts http://localhost:3000
```

You won't get the AI chat without Claude Code installed (the in-app agent shells out to the `claude` CLI), but the editor and export still work for static slides.

---

## 🧰 What you can do

- **Two-mode workspace** designed for flow: ideation chat (left) plus a content table on the dashboard, or a slide editor with live preview when you open a content item.
- **Generate content by chatting**: "Make me a 5-slide carousel about productivity habits — bold sans-serif, dark mode, accent red." Watch slides stream in.
- **Iterate per slide**: "Make slide 3 more minimal", "Change the accent to teal", "Swap the hook for something punchier."
- **Three Instagram aspect ratios** ready to go: 1:1 (1080×1080), 4:5 (1080×1350), 9:16 (1080×1920).
- **Brand config** — name, color palette, fonts, logo, style keywords. Claude reads it before every generation so output stays on-brand.
- **Business context** — describe your product/audience once; Claude uses it for ideation and copywriting.
- **Templates** — save any content item as a template, reuse it for the next one.
- **Style presets** — switchable look-and-feel applied across slides.
- **Reference images** — drop in screenshots of content you love. Claude studies them to match style.
- **Drag to reorder** slides via dnd-kit. Per-slide undo via version history.
- **Safe-zone overlay** to verify nothing important crops behind Instagram's UI.
- **Fullscreen preview** for the final review.
- **One-click export** — Puppeteer screenshots each slide HTML at the exact pixel dimensions Instagram expects, zips them, downloads.
- **Captions + hashtags** generator built into the editor.
- **All local** — content, brand, uploads, exports all live in `/data/` and `/public/uploads/`. Nothing is sent to a cloud you don't control. The only network call is when Claude Code talks to Anthropic.

---

## 💬 How the AI agent works

The in-app agent is the **Claude CLI** spawned as a subprocess from `/api/chat` with `--allowedTools Bash WebFetch`. Messages stream back to the browser via Server-Sent Events.

When you ask for a slide, Claude:

1. Reads your brand config + business context + active content item state from the system prompt
2. Writes the slide as a complete HTML/CSS string
3. POSTs it to `/api/content/[id]/slides` via `curl` (using its `Bash` tool)
4. The new slide appears in your filmstrip seconds later

### Example chat

```
You    > Create a 5-slide carousel about "3 morning habits that
         actually move the needle." Punchy, dark mode, accent red,
         portrait 4:5.

Claude > Coming up. I'll build a hook slide, three habit slides,
         and a CTA. Working...
         [streams 5 HTML slides into the filmstrip]

You    > Slide 3 — the headline is too long. Cut it in half and
         move the icon to the top.

Claude > Done.
         [updates that slide; you can undo if you preferred the old one]
```

### How the slides become PNGs

Slides are stored as **body-level HTML** (no `<html>`/`<head>`/`<!DOCTYPE>`). The shared function `wrapSlideHtml()` in `[src/lib/slide-html.ts](./src/lib/slide-html.ts)` wraps that body into a full document — adding font loading, dimension constraints, and box-sizing reset — and serves it both:

- to a **sandboxed `<iframe>`** for live preview in the editor
- to **Puppeteer (headless Chromium)** for export, screenshot at exact Instagram pixel dimensions, zipped, downloaded

Because the same wrap function feeds both paths, what you see is exactly what you export. No surprises.

---

## 🛠 Slash commands

Type these inside Claude Code:


| Command         | What it does                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `/start [port]` | Install + seed + run + open browser. Idempotent — re-running on a healthy install is seconds.           |
| `/stop [port]`  | Kill the dev server. Defaults to `:3000`, accepts a port arg matching `/start`.                         |
| `/reset`        | Wipe local content items, templates, brand config, uploads, exports — and re-seed defaults. Asks first. |
| `/doctor`       | Run setup diagnostics: Node version, Claude CLI on PATH, deps installed, data files seeded, port free.  |
| `/run-ingest`   | Update the project wiki (`wiki/`) from recent code/decision changes.                                    |


You can also run them outside Claude Code:

```bash
npm run setup     # install + seed (skips the browser-open + background server bits)
npm run dev       # start the dev server
npm run build     # production build
npm run doctor    # run scripts/doctor.mjs (works pre-`npm install`)
npm test          # vitest suite
```

---

## 🏗 Architecture

```mermaid
flowchart LR
  U(["Browser :3000"])
  C["Ideation Chat"]
  P["Slide Preview<br/>(sandboxed iframe)"]
  F["Filmstrip<br/>(dnd-kit)"]
  API["/api/chat<br/>SSE streaming/"]
  CCLI["Claude CLI<br/>subprocess"]
  SLIDES["/api/content/.../slides/"]
  DATA[("/data/*.json<br/>async-mutex<br/>atomic writes")]
  EXP["/api/content/.../export/"]
  PUP["Puppeteer<br/>(headless Chromium)"]
  ZIP{{"ZIP of PNGs"}}

  U --> C & P & F
  C -- "POST chat" --> API
  API -- "spawn" --> CCLI
  CCLI -. "SSE" .-> API
  API -. "SSE" .-> C
  CCLI -- "curl POST slide HTML" --> SLIDES
  SLIDES <--> DATA
  P <--> SLIDES
  F <--> SLIDES
  U -- "Export" --> EXP
  EXP --> PUP
  PUP --> ZIP
  ZIP --> U
```



**Why these choices:**

- **Local-first, single-user.** The whole app is a localhost web app talking to local files. No cloud, no auth, no database.
- **Claude CLI as the agent.** Lets us reuse the user's existing Claude Code authentication, capabilities, and context. The subprocess gets `Bash` (to `curl` the slide-write endpoints) and `WebFetch` (for research while designing).
- **Slides as HTML.** Claude already writes great HTML/CSS — way more flexible than canvas, way easier to debug than a JSON DSL. The same HTML powers preview *and* export, so what you see is what you ship.
- **Sandboxed iframes.** No `<script>` tags allowed (enforced by the iframe `sandbox=""` attribute). Slides can't run code or escape their box.
- **JSON file storage with async-mutex + atomic writes.** No SQLite, no Postgres. Reads and writes go through `[src/lib/data.ts](./src/lib/data.ts)` with proper locking, and writes are tmp-file + rename to avoid torn JSON.

For more, see `[CLAUDE.md](./CLAUDE.md)` — the architecture doc tuned for AI assistants working on this codebase, and the project wiki under `[wiki/](./wiki/)` for decisions, incidents, and external context.

---

## 📦 Tech stack


| Layer         | Tool                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | [Next.js 16](https://nextjs.org) (Turbopack), [React 19](https://react.dev)    |
| Language      | TypeScript 5                                                                   |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com) (CSS-first config in `globals.css`) |
| UI primitives | [Radix UI](https://www.radix-ui.com), [lucide-react](https://lucide.dev)       |
| Editor        | [Lexical](https://lexical.dev) for rich-text slide editing                     |
| Drag/drop     | [@dnd-kit](https://dndkit.com)                                                 |
| AI agent      | [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) subprocess        |
| Image export  | [Puppeteer](https://pptr.dev), [Sharp](https://sharp.pixelplumbing.com)        |
| Zipping       | [Archiver](https://github.com/archiverjs/node-archiver)                        |
| Storage       | JSON files + [async-mutex](https://github.com/DirtyHairy/async-mutex)          |
| Validation    | [Zod](https://zod.dev) schemas for ContentItem and slides                      |
| Testing       | [Vitest](https://vitest.dev)                                                   |


---

## 📁 Project structure

```
open-social/
├── .claude/
│   └── commands/             ← /start, /stop, /reset, /doctor, /run-ingest (slash commands)
├── data/                     ← user state (gitignored): brand, content items, templates, exports
├── public/uploads/           ← user uploads (gitignored): logos, reference images
├── scripts/
│   ├── setup.mjs             ← npm install + seed data dirs + Claude CLI detection (cross-platform)
│   └── doctor.mjs            ← env diagnostic (zero deps, runs pre-install)
├── src/
│   ├── app/
│   │   ├── api/              ← backend routes (chat, content, slides, export, brand, business-context, ...)
│   │   ├── content/[id]/     ← content item editor page
│   │   ├── globals.css       ← Tailwind v4 theme + motion tokens
│   │   ├── layout.tsx
│   │   └── page.tsx          ← dashboard (content items table + ideation chat)
│   ├── components/
│   │   ├── brand/            ← BrandSetup, ColorPicker, FontSelector, LogoUpload
│   │   ├── business-context/ ← business/audience configuration UI
│   │   ├── chat/             ← ChatPanel, ChatMessage, ChatInput, ReferenceImages
│   │   ├── content/          ← ContentItem detail + ideation surfaces
│   │   ├── dashboard/        ← ContentItemsTable, IdeationChat
│   │   ├── editor/           ← Preview, SlideFilmstrip, SlideRenderer, ExportButton, ...
│   │   ├── layout/           ← TopBar
│   │   ├── templates/        ← TemplateGallery, TemplateCard
│   │   └── ui/               ← Button, Input, Badge, ConfirmDialog, dialogs
│   ├── lib/
│   │   ├── chat-system-prompt.ts          ← dynamic system prompt (brand + content item context)
│   │   ├── content-generation-system-prompt.ts
│   │   ├── content-idea-system-prompt.ts
│   │   ├── ideation-system-prompt.ts
│   │   ├── slide-html.ts                   ← wrapSlideHtml() — the rendering contract
│   │   ├── content-items.ts                ← ContentItem + slide CRUD with version history
│   │   ├── content-item-schema.ts          ← Zod schemas for ContentItem validation
│   │   ├── data.ts                         ← JSON storage with async-mutex + atomic writes
│   │   ├── claude-path.ts                  ← portable Claude CLI discovery
│   │   ├── style-presets.ts
│   │   ├── staged-actions.ts
│   │   └── ...
│   └── types/                ← shared TypeScript types (incl. content-item.ts)
├── wiki/                     ← project wiki (decisions, incidents, external context)
├── CLAUDE.md                 ← architecture doc for AI assistants working on this code
├── LICENSE                   ← MIT
├── README.md                 ← you are here
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## ⚙️ Configuration

### Environment variables (`.env.local`)

Created automatically by `scripts/setup.mjs` if it can find your Claude CLI. You can override:

```bash
CLAUDE_CLI_PATH=/path/to/claude   # set if `which claude` doesn't find it
```

On Windows, run `where claude` in PowerShell to find the path (typically `C:\Users\<you>\AppData\Roaming\npm\claude.cmd`), then set `CLAUDE_CLI_PATH` in `.env.local`.

### Brand config

Set on first run (or via the gear icon in the top bar). Stored at `/data/brand.json`. Fields:

- **Name** — your handle / company / project
- **Colors** — primary, secondary, accent, background, surface
- **Fonts** — heading + body (Google Fonts; the `/api/fonts` endpoint serves a curated list)
- **Logo** — optional; used by Claude when you ask for branded slides
- **Style keywords** — free-text style hints ("editorial, minimalist, warm tones") that get injected into Claude's system prompt

### Business context

Describe your product, ICP and tone once (`/api/business-context`). Stored at `/data/business-context.json`. The ideation system prompt reads it so Claude proposes content angles that fit your audience.

### Templates

Save any content item as a template via the bookmark icon in the editor toolbar. Templates appear in the dashboard's Templates tab. Stored at `/data/templates.json`.

### Reference images

Drop screenshots into the chat panel's "Reference Images" section. Stored under `/public/uploads/`. Claude Code can read them via `WebFetch` of the local URL when designing.

---

## 🩺 Troubleshooting

`**/start` says "Node v18 detected, need ≥20."**
Next.js 16 requires Node 20+. Install via [nodejs.org](https://nodejs.org) or [nvm](https://github.com/nvm-sh/nvm).

`**/start` says "Claude CLI not found."**
Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and authenticate. The setup script searches `~/.local/bin/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`, `~/.npm-global/bin/claude`, and `$CLAUDE_CLI_PATH`. If yours lives elsewhere, set `CLAUDE_CLI_PATH` in `.env.local`.

**Port 3000 is in use.**
Run `/stop` to kill whatever's there, or run `/start 3001` to use a different port.

**Export fails or hangs.**
Likely a Puppeteer/Chromium issue. Try `rm -rf node_modules && npm install` to re-trigger the Chromium download. On Linux you may need `apt install` of common Chromium dependencies (libnss3, libatk1.0-0, libxss1, etc.).

**Slides look fine in preview but export looks different.**
That shouldn't happen — both go through `wrapSlideHtml()`. If it does, file an issue with the slide HTML attached.

**The AI keeps generating slides that ignore my brand colors.**
Open the brand setup (gear icon) and confirm your colors and style keywords are saved. They're injected into Claude's system prompt on every chat request via `chat-system-prompt.ts`.

**Run `/doctor`** for a full env audit — it'll tell you which of the above applies.

---

## 🗺️ Roadmap

Open ideas — PRs welcome.

- **Multi-language slide generation** — Spanish-LATAM voice presets so creators don't fight the AI's English defaults
- **Reels storyboard mode** — vertical 9:16 with optional text-on-clip annotations
- **Twitter/X thread export** — same brand voice, different surface
- **Notion / Linear export** — push the content as a doc with each slide as a section
- **Theme presets gallery** — community-curated style presets you can one-click apply
- **Per-slide AI chat** — a smaller chat thread scoped to a single slide
- **Hosted demo** — for people who want to try before installing Claude Code

---

## 🤝 Contributing

PRs welcome. The bar:

- **Run `npm run doctor`, `npm test` and `npm run build`** before opening a PR — all should pass clean.
- **Follow the file conventions** in `[CLAUDE.md](./CLAUDE.md)` — components ≤ 300 lines, types in `src/types/`, libs in `src/lib/`, `cn()` from `src/lib/utils.ts` for class merging, all data writes through `src/lib/data.ts`.
- **Don't touch the slide rendering contract.** `wrapSlideHtml()` in `src/lib/slide-html.ts` is the seam between preview and export. Change it carefully and test the export round-trip.
- **Wiki-first for non-trivial changes.** Read `wiki/index.md` before refactors that touch slide pipeline / chat / export / data layer / API contracts. After landing a decision-bearing change, run `/run-ingest`.

---

## 🙏 Acknowledgments

- **[Hainrixz/open-carrusel](https://github.com/Hainrixz/open-carrusel)** — Open Social is a fork of the original `open-carrusel` project by [tododeia](https://www.tododeia.com) (Enrique Rocha). The chat-driven carousel concept, slide HTML rendering contract, three-panel editor, and most of the foundational code came from there. All credit for the original design goes to them.
- **[Emil Kowalski](https://emilkowal.ski)** — animation philosophy that shaped the whole motion system. The `oc-`* CSS classes encode his design-engineering principles (custom easings, restraint over excess, `@starting-style` over JS for entries).
- **[Anthropic](https://www.anthropic.com)** — Claude (the model) and Claude Code (the CLI) are the brain of the in-app agent.
- **[Vercel](https://vercel.com)** — Next.js + Turbopack make local-first React apps feel snappy.
- **[Radix UI](https://www.radix-ui.com)** + **[shadcn/ui](https://ui.shadcn.com)** — the patterns underneath the dialog/button/input primitives.
- **[dnd-kit](https://dndkit.com)** — the only sane drag-and-drop story in React.
- **[Puppeteer](https://pptr.dev)** + **[Sharp](https://sharp.pixelplumbing.com)** — the export pipeline.

---

## 📄 License

[MIT](./LICENSE) — do anything you want with it. Attribution appreciated, never required.