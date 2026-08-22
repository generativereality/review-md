---
name: render-doc
description: >
  Turn any markdown doc into a single self-contained styled HTML file (and a sane PDF) for
  screen-share, a meeting pre-read, or handing to someone outside the team. Runs the
  `render-doc` CLI; batch-renders a whole pack from a manifest. Use when the operator says
  "render this doc as HTML", "make a styled version of X", "make X presentable", "render the
  pack", "re-render the pre-reads", "PDF of this doc", "print this doc", "make a pre-read out
  of this", "styled version for the meeting", "put this on screen", "share this doc with
  marketing / outside the team", or names a doc plus "HTML" / "PDF" / "screen-share".
  Documents the design contract (callout glyph mapping, type scale, tokens) so renders stay
  consistent. NOT for slide decks — a deck is a different job and a different tool.
---

# render-doc — markdown → one styled, self-contained HTML file

Markdown is the source of truth, but a `.md` file is a poor artifact to put on a screen in a
meeting or hand to someone outside the team. This renders any markdown doc into a **single
self-contained HTML file** that looks deliberate — one file, no network, opens from `file://`
on someone else's laptop.

```bash
render-doc docs/PLAN.md
render-doc docs/KPIS.md --kicker "Growth · KPI reference" \
  --banner-left "Weekly sync · Fri 2026-08-07" --banner-right "updated after the session"
render-doc --manifest packs/planning.json     # a whole pack
render-doc --help
```

Output lands in **`rendered-docs/`** by default (`--out-dir` to move it). Treat it as derived —
gitignore it and re-render; don't archive renders next to the markdown they came from.

> ⚠️ **This exists because the throwaway version didn't.** The original pack was rendered by a
> Python script in a session scratchpad. The scratchpad got wiped mid-session and **the renderer
> and all 25 rendered files were lost** — the markdown was safe in git, the tool was not. Don't
> write a one-off renderer in a scratchpad again; that is what this is.

## Install

```bash
npm install -g @generativereality/render-doc     # or: /plugin install render-doc@generativereality
```

⛔ **`command not found` right after a clean `-g` install** is almost always the **npm prefix**,
not a failed install: `npm -g` writes into `$(npm prefix -g)/bin`, and a custom `prefix=` in
`~/.npmrc` puts that somewhere your shell doesn't look. Check with `npm prefix -g`, then put
`$(npm prefix -g)/bin` on `PATH`.

⚠️ If you install from a registry mirror rather than npmjs, the **scoped** name is the one that
resolves — a bare `render-doc` 404s.

## When NOT to use this

| You want                                             | Use instead                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| **Slides** — one idea per screen, arrow keys         | a deck tool; this is a document renderer                           |
| A page in a website's own brand system               | that site's pipeline (different tokens entirely)                   |
| To commit the HTML                                   | Don't. Commit the `.md`; gitignore `rendered-docs/`                |
| Hero stat tiles, distribution bars, a coverage strip | Hand-author it. See **Known gaps** below                           |

**Decks and documents are different jobs.** A deck is a fixed-height stage with per-slide nav and
a slide counter; this is long-form reading on cream paper with a sticky right-hand jump rail and
a print stylesheet. Neither type scale survives being forced onto the other surface. There is
exactly one document theme here — don't start a second.

## ⛔ It renders ONE doc — a second path is the DESTINATION, and it gets overwritten

The signature is **`render-doc <src.md> [dst.html]`**. There is no multi-file form, so passing two
sources —

```bash
render-doc docs/A.md docs/B.md      # ⛔ writes HTML *over* docs/B.md
```

— reads `A.md` and **writes the rendered HTML on top of `B.md`**, destroying it. It exits 0 and logs a single
cheerful `✓ docs/B.md (247 KB)`, which reads as "rendered B" rather than "overwrote B". Two tells: the ✓ path is
outside `rendered-docs/`, and only **one** ✓ appears for two files.

⇒ **To render several docs, loop** (or use `--manifest` for a real pack):

```bash
for f in A B; do render-doc "docs/$f.md"; done
```

⚠️ **And commit before rendering anything uncommitted.** _(Hit for real: a brand-new, untracked
doc was clobbered this way, and because it had never been committed there was nothing for
`git checkout --` to restore — it had to be retyped from scratch.)_ Cheap habit that would have
made it a non-event: `git add -N <file>` on any doc you are about to render, so a bad destination
is recoverable.

## ⚠️ `out: "index.html"` is reserved in a pack

A manifest render generates **its own contents page at `index.html`** after rendering every doc. So setting
`"out": "index.html"` on one of the `docs` entries **succeeds, then gets silently overwritten** by the pack
index — you end up with the contents page and no render of that document, and the log shows both writes with
no error. Give it any other name. _(Hit for real: a pack's README vanished and came back as `JOBS-README.html`.)_

## The design contract

**`theme.ts` is the single source of visual truth.** Every colour, size and rule — including the
mermaid diagram palette — comes from it. To change the look, change tokens there and cut a
release; never hand-edit an output file, and never restyle one render.

**Tokens** (`:root`):

| Token                           | Value                             | Role                        |
| ------------------------------- | --------------------------------- | --------------------------- |
| `--paper` / `--paper-deep`      | `#faf7f0` / `#f3eee2`             | page, and tinted panels     |
| `--paper-card`                  | `#fffdf7`                         | table and boxed backgrounds |
| `--ink` / `--ink-2` / `--ink-3` | `#231f18` / `#5c554a` / `#8a8172` | body, secondary, meta       |
| `--accent` / `--accent-soft`    | `#8c2f1b` (rust) / `#f4e3dd`      | links, §-numbers, selection |
| `--rule` / `--rule-soft`        | `#d9d2c2` / `#e8e2d3`             | borders, hairlines          |
| `--max`                         | `84rem`                           | sheet width                 |
| `--rail` / `--gutter`           | `16rem` / `2.4rem`                | jump rail, and its gutter   |

Plus a fine dot texture (`radial-gradient`, 26px grid) on the page, and a **dark banner masthead**.

`--max` is not a free number: `--max − 2×2.2rem padding − --rail − --gutter ≈ 62rem`, the body
measure the type scale (and the `p` / `pre` max-width) is set for. Change one, re-derive the rest.

**Type scale** — Fraunces for display, IBM Plex Sans for body, IBM Plex Mono for anything
structural (kicker, banner, table headers, meta, code). Sizes sit a notch below what a projected
briefing would use: a working doc is read at desk distance, not projected.

| Element                       | Font          | Size                                 |
| ----------------------------- | ------------- | ------------------------------------ |
| `h1` (masthead only)          | Fraunces 900  | `clamp(1.95rem, 4vw, 2.9rem)`        |
| standfirst                    | Plex Sans 400 | `1.02rem`                            |
| `h2`                          | Fraunces 600  | `1.42rem`, prefixed `§1 §2 …`        |
| `h3`                          | Fraunces 600  | `1.1rem`                             |
| `h4`                          | Plex Mono 600 | `12px`, uppercase, letterspaced      |
| `> #` headline box            | Fraunces 700  | `1.3rem` (`h2` inside a quote: 1.15) |
| body                          | Plex Sans 400 | `16px / 1.62`, max `62rem`           |
| kicker, meta, `th`, `caption` | Plex Mono     | `11.5–13px`, uppercase, letterspaced |
| jump rail                     | Plex Mono 500 | `11.5px` (`10.5px` for `H3` entries) |

⚠️ **`h1` is the page title and nothing else.** Docs use `> # ⭐ …` as a highlighted-headline
callout box, and at masthead scale that renders as a second page title mid-document — which is
exactly how it read before. Every heading level inside a `blockquote` therefore has its own,
much smaller size; keep it that way if you touch the scale.

### Callout glyphs — the convention this tool is built around

Lead a sentence with a glyph and that glyph carries the emphasis. **This is the tool's own
convention**, not a per-repo setting: same eight marks, same meanings, every document. The
renderer reads **position**, not just the character:

- **Leading a paragraph or list item** → the whole block becomes a tinted callout panel with an
  accent rule and the glyph as its mark.
- **Mid-sentence, or anywhere in a table cell or heading** → an inline badge, so the sentence keeps
  flowing. **Table cells never become panels** — a bordered panel inside a `<td>` wrecks the table,
  and working docs badge inside cells constantly.

| Glyph | Kind        | Means                                             | Tint   |
| ----- | ----------- | ------------------------------------------------- | ------ |
| ⭐    | `star`      | the headline finding — read this one              | gold   |
| 🚩    | `flag`      | a structural problem someone must answer          | rust   |
| ⚠️    | `warn`      | a qualification on the claim next to it           | amber  |
| ⛔    | `stop`      | disproven, prohibited or dead — don't build on it | maroon |
| ⏸    | `parked`    | blocked on a decision or a permission             | stone  |
| ✅    | `done`      | settled, delivered or already approved            | green  |
| ⚡    | `zap`       | in flight right now                               | teal   |
| ⇒     | _therefore_ | a connective, not a severity                      | accent |

`⇒` leading a block makes a **therefore** callout; if a severity glyph follows it
(`⇒ ⚠️ **On incremental cash the order inverts.**`) the **severity wins the colour** and both
glyphs render. The variation selector is optional — `⚠` and `⚠️` both work.

### Diagrams — a `mermaid` fence

A fence tagged `mermaid` renders as **inline SVG, embedded at build time**. The output stays one
self-contained file: nothing is fetched when it opens, and mermaid's own 3.5 MB bundle is not in
it — only the SVG it produced.

That works because mermaid runs during the render, in a headless Chromium, where a node box can
be sized from the text actually inside it. What that buys, and what it costs:

| Thing                      | Why it is that way                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Needs a Chromium           | `playwright-core` reuses whatever is already in the shared Playwright cache — no second download. Missing? The error says so: `npx playwright install chromium`, or `--no-diagrams`.       |
| One browser launch per run | Every diagram in every doc of a pack renders in a single launch, so a 12-doc pack pays ~1s of fixed cost once.                                                                             |
| `htmlLabels: false`        | Labels are `<text>`, never HTML in a `<foreignObject>` — the foreignObject kind is the one that comes out blank when the page is printed.                                                  |
| Deterministic element ids  | `mmd-<doc>-<block>`. mermaid scopes its generated CSS and arrowhead markers under the id, so two diagrams on a page must not share one, and a random id would make every re-render a diff. |

**Colours come from `theme.ts`, via `diagramTheme()`** — never mermaid's stock palette. Node fills
are `--paper-card` cards on a `--paper-deep` figure panel, borders `--ink-3`, edges and edge labels
`--ink-2`, clusters and sequence label boxes `--paper-deep`, notes and activations `--accent-soft`
with an `--accent` border, all label text full `--ink`. Borders are `--ink-3` rather than `--rule`
because `--rule` disappears at print scale. Change a colour in `TOKENS` and diagrams move with the
document; a test asserts every colour the diagram theme sets is a token.

**In print** a diagram is capped at `240mm` tall. An SVG with a viewBox has an intrinsic aspect
ratio, so capping the height scales the width with it, and 240mm is inside the text height `@page`
leaves on A4 — which means a tall flowchart is moved whole onto a fresh page instead of being
**sliced** by the page break (`break-inside: avoid` can only move a box that fits on a page at
all). A 1:2 flowchart lands at roughly 6pt: small, but vector, so it stays sharp at any zoom.

⚠️ **A fence mermaid can't parse falls back to showing its source, and warns** — same contract as
the footnote check, so `--strict` fails on it. If a diagram renders as a code block, read the
`⚠ mermaid` line; it carries mermaid's own parse error with the line number.

### What else the renderer does for free

- **GFM**: tables, footnotes with backlinks, fenced code, task lists, nested lists, blockquotes.
- **`mermaid` fences become diagrams** — flowchart / `graph`, `sequenceDiagram`,
  `stateDiagram-v2` and the rest, as **inline SVG rendered at build time**, themed from
  `theme.ts`. See **Diagrams** above for the contract and the one dependency it carries.
- **Masthead** from structure: first `H1` → title; everything between it and the first `H2` →
  standfirst; a provenance line with the source path, the source file's **git revision** and the
  render date.
- **Sticky jump rail** built from the headings (`--toc-depth 3` to include `H3`), in a right-hand
  column beside the text, with the section you're reading highlighted and scrolled into view.
  Below `64rem` of viewport there is no room for a rail, so it **collapses to a sticky top bar**
  carrying the `H2`s only — a 30-entry bar at `--toc-depth 3` wrapped to a dozen rows and buried
  the page it was there to navigate. Below `48rem` (a phone) the bar goes further and becomes
  **one nowrap row that scrolls sideways**, with the current section scrolled into view
  horizontally: wrapped, it hit its `26vh` cap at 219px on a 390px screen — a quarter of the
  viewport on every scroll position, with the last visible entry sliced through the middle, which
  reads as a rendering fault rather than as "scroll me". Heading `scroll-margin` is measured off the
  live nav height in bar mode. `--toc-mode` (`rail` / `bar`) is the single source of truth for
  which one is live: the media query sets it, the inlined script reads it back, so the breakpoint
  is never duplicated in JS. A doc with fewer than two nav entries gets **no rail column at all**,
  so the body keeps the full sheet width.
- **`- **Term** — definition` bullet lists** are recognised as definition lists (glossaries, the
  per-item lists) and set with a hanging `→` and rules instead of a wall of bullets.
- **Numeric table cells** get tabular figures.
- **Link rewriting** — an intra-pack `.md` link becomes the sibling's local `.html`; any other
  in-repo `.md` or directory link becomes a URL on the source repo's own forge, so the file still
  works off-repo. External links, anchors and `.html` links are left exactly as authored.
- **Print stylesheet** → `Cmd-P` gives a sane PDF: banner collapses to a rule, jump rail and
  watermark drop out (**and the grid un-grids with them**, or the body prints two-thirds width
  against a blank strip), callouts/tables/rows don't split across pages, `thead` repeats, external
  link targets print inline.

## Repo-awareness — derived, never hardcoded

The provenance footer and the `.md`→forge link rewriting come from **the repo the source document
lives in**: `git remote get-url origin`, normalised (`git@github.com:o/r.git` →
`https://github.com/o/r`). The root is resolved from the *source file's* directory, not the cwd,
so rendering a doc in another checkout or worktree still cites the right repo.

✅ **A doc outside any repo still renders.** No git, no repo, or a repo with no `origin`: the
revision line drops out of the meta, the source is shown by name, and in-repo `.md` links are left
exactly as authored rather than pointed at somebody else's GitHub. Override with `--repo-url`.

## Flags

| Flag                    | Effect                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `--kicker <text>`       | eyebrow line above the title                                       |
| `--banner-left <text>`  | banner left — **context** (`"Planning · Fri 2026-08-07"`)          |
| `--banner-right <text>` | banner right — **status** (`"updated after the session"`)          |
| `--ghost <text>`        | watermark glyph behind the masthead                                |
| `--title <text>`        | override the H1-derived title                                      |
| `--out-dir <dir>`       | default `rendered-docs`                                            |
| `--toc-depth 3`         | include `H3` in the jump nav                                       |
| `--date <YYYY-MM-DD>`   | render date in the meta line                                       |
| `--repo-url <url>`      | override the derived repo URL                                      |
| `--no-fonts`            | skip the inlined woff2 (~225 KB smaller; needs the fonts locally)  |
| `--no-diagrams`         | leave `mermaid` fences as code blocks (skips the headless browser) |
| `--no-section-numbers`  | drop the `§1 §2` prefixes                                          |
| `--strict`              | exit 1 on any footnote or diagram problem                          |
| `--quiet`               | only print warnings                                                |

**Banner sides are flags, not constants.** Hardcoding them was the throwaway version's most
annoying property.

## Packs

A pack is the normal unit, so re-rendering after edits is one command. Keep manifests in the repo
being rendered — anywhere you like; `--manifest <path>` takes a path:

```json
{
  "name": "Planning pack",
  "outDir": "rendered-docs/planning",
  "defaults": { "bannerLeft": "Planning · Fri 2026-08-07, 09:00" },
  "docs": [
    { "src": "docs/SESSION-SHEET.md", "kicker": "…", "ghost": "7" },
    { "src": "docs/business-cases/README.md", "out": "business-cases.html", "blurb": "…" }
  ]
}
```

`src` and `outDir` are relative to the repo root (or the cwd, outside a repo). Per-doc keys
override `defaults`. `out` renames the output; `blurb` overrides the index summary. The pack also
gets an **`index.html`** cover listing every doc, and docs in the same pack cross-link to each
other's `.html`, so the folder is navigable offline on its own.

## Footnote integrity — the check that has to be ours

Every run checks the raw markdown and warns (add `--strict` to fail):

| Problem                      | Why it matters                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| **duplicate `[^n]:`**        | every renderer keeps the first and says nothing — a finding silently lost its provenance         |
| **definition, no reference** | renders at the foot looking cited while the figure it was written for sits uncited               |
| **reference, no definition** | markdown-it leaves the literal `[^7]` in the prose — easy to skim past on a screen-share         |

References inside code fences and inline code are ignored. Line numbers are the real source lines.

## ⭐ Always open what you rendered — a ✓ is not a look

**A render is not done until it has been looked at.** The ✓ line reports bytes written, not that
the masthead reads right, that a table survived a bulk edit, or that a diagram parsed — and each of
those has gone wrong while the log stayed cheerful. Open every file the run produced:

```bash
browser-automation launch                       # idempotent
browser-automation goto -s dataset     "file:///abs/path/rendered-docs/signup/dataset.html"
browser-automation goto -s action-plan "file:///abs/path/rendered-docs/signup/action-plan.html"
browser-automation goto -s signup-index "file:///abs/path/rendered-docs/signup/index.html"
```

⚠️ **A pack means one tab per doc, plus `index.html`.** The whole point of re-rendering the pack is
that the siblings move together — opening only the one you edited re-creates the stale-sibling
problem from the other direction.

**Then verify the edit is actually in the output, rather than trusting the byte count:**

```bash
browser-automation eval -s dataset 'document.title + " | h2s: " + document.querySelectorAll("h2").length'
grep -c "a phrase you just added" rendered-docs/signup/dataset.html
```

⛔ **`file://` needs an ABSOLUTE path.** A relative one resolves against the browser's own cwd and
lands on a "file not found" page that reads like a broken render.

⇒ **Reuse the session names as stable handles** (`-s dataset`): after a re-render, the same
`browser-automation goto -s dataset <same url>` reloads **in place** instead of piling up tabs.

## Opening a render at a specific section

⛔ **`scrollIntoView()` via `browser-automation eval` does not stick** — the inlined jump-nav script resets scroll on load, so the screenshot comes back showing the masthead every time. _(Cost several wasted screenshots.)_

✅ **Use the anchor hash instead.** Every `h2` gets a slugged id, so navigate straight to it:

```bash
browser-automation goto -s doc "file://$PWD/rendered-docs/<pack>/<doc>.html#3-conversion-from-step-to-step"
```

List the available ids with `browser-automation eval -s doc '[...document.querySelectorAll("h2")].map(h=>h.id).join("|")'`. The same hash works in a link you hand someone, which is the better way to point a reviewer at one section than telling them to scroll.

## Known gaps — hand-author these, don't bolt them on

Some structures have **no markdown equivalent**: hero stat tiles (`1 / 18`), a routing
distribution bar, a coverage strip, a `<dl>` glossary box. A renderer whose input is plain
markdown can't invent them, and inventing a non-standard fence for them would break GitHub's own
rendering of the source doc. When a doc genuinely needs them, hand-author that one artifact — and
keep the markdown as the content of record.

## ⛔ Once a doc is in a pack, render the PACK — a single-file render silently strands its siblings

`render-doc <one.md>` writes to `rendered-docs/<NAME>.html`, **not** into the pack's `outDir`. So
iterating on one doc leaves the pack's own copy, its siblings and its `index.html` at whatever they
were — and the operator reviewing `rendered-docs/signup/` sees a stale set with no warning
anywhere. Nothing errors; the file you just rendered is perfect, in the wrong place.

Once a manifest covers a doc, **always** re-render through the manifest:

```bash
render-doc --manifest packs/signup.json --strict
```

_(Hit for real: a data set was re-rendered ~six times over an hour while `action-plan.html` and
`index.html` in the same pack stayed three hours old. The operator caught it, not the tool.)_

## Checklist

1. **In a pack? → `--manifest`.** Otherwise `render-doc <src.md>` — read the footnote warnings; they're usually real.
2. **Open every rendered file in `browser-automation`** (§ _Always open what you rendered_) — check the masthead reads right, set `--kicker` / `--banner-*` if it doesn't, and `grep` the output for a phrase you just added. The ✓ does not prove the edit landed.
3. `Cmd-P` if a PDF is wanted — the print stylesheet is real, but eyeball page breaks.
4. Recurring set of docs → add a manifest and check it into the repo being rendered.
5. Changing the look → change `theme.ts` in the render-doc repo and cut a release, not one output file.
