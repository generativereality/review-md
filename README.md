# review-md

**Markdown → one self-contained, styled HTML file.** No build step, no network, no assets folder —
a single `.html` you can email, screen-share, or open from a USB stick on someone else's laptop.
`Cmd-P` gives a sane PDF.

```bash
npm install -g @generativereality/review-md

review-md docs/PLAN.md                      # → rendered-docs/PLAN.html
review-md --manifest packs/planning.json    # a whole pack + its index.html
```

Markdown is the right source of truth. It is a poor artifact to put on a screen in a meeting.
This closes that gap without asking you to leave markdown.

## What you get

- **One file.** CSS inlined, woff2 subsets base64-inlined, diagrams embedded as SVG. Opens from
  `file://`, offline, forever.
- **Mermaid at build time.** A ` ```mermaid ` fence is rendered in a headless Chromium during the
  render and only its **SVG** is embedded — so labels are laid out against real text metrics, and
  mermaid's 3.5 MB bundle is nowhere in the output.
- **A callout convention that carries emphasis.** Lead a line with `⭐ 🚩 ⚠️ ⛔ ⏸ ✅ ⚡ ⇒` and it
  becomes a tinted panel; mid-sentence or in a table cell it becomes an inline badge instead.
- **A masthead built from structure.** First `H1` → title, everything up to the first `H2` →
  standfirst, plus a provenance line carrying the source path, its **git revision**, and the date.
- **A sticky jump rail** from the headings, collapsing to a top bar on a narrow window and to a
  sideways-scrolling row on a phone.
- **Footnote integrity checking.** Duplicate definitions, orphaned definitions, and references with
  no definition — each of which every other renderer swallows silently. `--strict` makes them fail.
- **A real print stylesheet.** Banner collapses, rail drops out, tables and callouts don't split
  across pages, `thead` repeats, external link targets print inline.
- **Packs.** A JSON manifest renders a whole set in one command, generates an `index.html` cover,
  and cross-links the docs to each other — so the output folder is navigable on its own.

Nothing in it is repo-specific: the provenance footer and the `.md`→GitHub link rewriting are
derived from the source document's own `git remote`, and a doc outside any repo still renders.

## Install

**As a Claude Code plugin** (recommended — installs the skill so Claude can drive it):

```
❯ /plugin marketplace add generativereality/plugins
❯ /plugin install review-md@generativereality
❯ /reload-plugins
```

**Via npm** (CLI only):

```bash
npm install -g @generativereality/review-md
```

**Requirements:** Node.js 22+. Diagrams additionally need a Chromium in the shared Playwright
cache — `npx playwright install chromium` if you don't have one, or pass `--no-diagrams`.

<details>
<summary><b><code>review-md: command not found</code> after a clean install</b></summary>

Almost always the **npm prefix**, not a failed install: `npm -g` writes to `$(npm prefix -g)/bin`,
and a custom `prefix=` in `~/.npmrc` puts that somewhere your shell doesn't search. Check with
`npm prefix -g`, then put that `bin` directory on `PATH`.

If you install from a registry mirror rather than npmjs, note the package name is **scoped** — a
bare `review-md` will 404.

</details>

## Usage

```
review-md <src.md> [dst.html] [options]
review-md --manifest <pack.json> [options]
```

| Flag                    | Effect                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `--kicker <text>`       | eyebrow line above the title                                       |
| `--banner-left <text>`  | banner left — **context** (`"Planning · Fri 2026-08-07"`)          |
| `--banner-right <text>` | banner right — **status** (`"updated after the session"`)          |
| `--ghost <text>`        | watermark glyph behind the masthead                                |
| `--title <text>`        | override the H1-derived title                                      |
| `--out-dir <dir>`       | default `rendered-docs`                                            |
| `--toc-depth <2\|3>`    | deepest heading in the jump nav (default 2)                        |
| `--date <YYYY-MM-DD>`   | render date shown in the meta line                                 |
| `--repo-url <url>`      | override the URL derived from `git remote get-url origin`          |
| `--no-fonts`            | skip the inlined woff2 (~225 KB smaller; needs the fonts locally)  |
| `--no-diagrams`         | leave `mermaid` fences as code blocks (skips the headless browser) |
| `--no-section-numbers`  | drop the `§1 §2` prefixes                                          |
| `--strict`              | exit 1 on any footnote or diagram problem                          |
| `--quiet`               | only print warnings                                                |

### ⛔ A second path is the DESTINATION, not a second source

```bash
review-md docs/A.md docs/B.md      # writes rendered HTML *over* docs/B.md
```

There is no multi-file form. It exits 0 and logs one cheerful `✓ docs/B.md`, which reads as
"rendered B". To render several, loop — or use a manifest.

## Packs

```json
{
  "name": "Planning pack",
  "outDir": "rendered-docs/planning",
  "defaults": { "bannerLeft": "Planning · Fri 2026-08-07, 09:00" },
  "docs": [
    { "src": "docs/SESSION-SHEET.md", "kicker": "Session sheet", "ghost": "7" },
    { "src": "docs/business-cases/README.md", "out": "business-cases.html", "blurb": "Overview." }
  ]
}
```

```bash
review-md --manifest packs/planning.json --strict
```

`src` and `outDir` resolve against the repo root (or the cwd, outside a repo). Per-doc keys
override `defaults`. The pack gets an `index.html` cover, and its docs cross-link to each other's
local `.html`.

⚠️ `"out": "index.html"` is reserved — the pack cover is written last and would overwrite it.

## The design contract

`src/theme.ts` is the **single source of visual truth**: tokens, type scale, page shell, print
rules, and the mermaid palette (via `diagramTheme()`) all come from it. A test asserts every
colour the diagram theme sets is a token, so a diagram can never drift from the document around
it. Change the look there and every render moves together; never hand-edit an output file.

| Token                           | Value                             | Role                        |
| ------------------------------- | --------------------------------- | --------------------------- |
| `--paper` / `--paper-deep`      | `#faf7f0` / `#f3eee2`             | page, and tinted panels     |
| `--paper-card`                  | `#fffdf7`                         | table and boxed backgrounds |
| `--ink` / `--ink-2` / `--ink-3` | `#231f18` / `#5c554a` / `#8a8172` | body, secondary, meta       |
| `--accent` / `--accent-soft`    | `#8c2f1b` (rust) / `#f4e3dd`      | links, §-numbers, selection |
| `--rule` / `--rule-soft`        | `#d9d2c2` / `#e8e2d3`             | borders, hairlines          |
| `--max`                         | `84rem`                           | sheet width                 |
| `--rail` / `--gutter`           | `16rem` / `2.4rem`                | jump rail, and its gutter   |

Fraunces for display, IBM Plex Sans for body, IBM Plex Mono for anything structural. Full type
scale and callout mapping: [`skills/review-md/SKILL.md`](skills/review-md/SKILL.md).

### Callout glyphs

| Glyph | Means                                             |
| ----- | ------------------------------------------------- |
| ⭐    | the headline finding — read this one              |
| 🚩    | a structural problem someone must answer          |
| ⚠️    | a qualification on the claim next to it           |
| ⛔    | disproven, prohibited or dead — don't build on it |
| ⏸    | blocked on a decision or a permission             |
| ✅    | settled, delivered or already approved            |
| ⚡    | in flight right now                               |
| ⇒     | *therefore* — a connective, not a severity        |

## Development

```bash
npm install
npm run dev -- docs/EXAMPLE.md   # run from source via tsx
npm run check                    # typecheck + tests + build
```

`npm run check` runs the full suite. Two diagram tests need a Chromium and skip without one
(`npx playwright install chromium` to cover them).

## Why this exists

The first version of this renderer was a Python script in a session scratchpad. The scratchpad got
wiped mid-session and **the renderer and all 25 rendered files went with it** — the markdown was
safe in git, the tool was not. It was rebuilt as a real, tested, versioned thing. Then it lived
inside one product repo, where every other repo that wanted it couldn't have it. Now it lives here.

## License

MIT
