# Measuring how long a doc prints

When a doc has a page budget ("max 2 A4"), **measure it; do not estimate from the
markdown.** Word count is a poor predictor because the cost is structural.

```bash
review-md docs/X.md --quiet
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=/tmp/X.pdf "file://$PWD/rendered-docs/X.html"
python3 -c "import re;print(len(re.findall(rb'/Type\s*/Page[^s]',open('/tmp/X.pdf','rb').read())))"
pdftotext -layout /tmp/X.pdf - | awk 'BEGIN{p=1}/\f/{p++;print "@@@PAGE"p;next}{print}'
```

The last line is the one that saves time: it shows **which content landed on which
page**, so you cut the right thing instead of guessing.

## On Windows

The recipe does not run as written:

- **There is no `--print-to-pdf` wrapper.** Drive Chrome directly,
  `C:\Program Files\Google\Chrome\Application\chrome.exe`, with the same flags, an
  absolute `--print-to-pdf=` path and a `file:///C:/...` URL.
- ⚠️ **Chrome writes the byte count to stderr, which Windows PowerShell surfaces as a
  `NativeCommandError` on a run that fully succeeded.** Check the file, not the exit
  status.
- A page count without `pdftotext`:
  `node -e "const b=require('fs').readFileSync('x.pdf').toString('latin1');console.log((b.match(/\/Type\s*\/Page[^s]/g)||[]).length)"`.
- A package manager installed globally (`pnpm`, `npx` shims) is often not on `PATH` in
  Git Bash or PowerShell; invoke its `.cmd` under `%APPDATA%\npm` directly.

## What the page count responds to

Measured cutting three briefs from 5–6 A4 pages to 2:

| Lever | Effect |
| --- | --- |
| Prose wording | ~290 words per A4 page, but trimming sentences often changes **nothing** (see below) |
| A glyph-led paragraph (`⭐`, `⛔`, `⚠️`) | Renders as a padded panel. Merging it into the preceding paragraph as an **inline** glyph saves ~3 lines |
| An `h2` | Heading, `§` number and margins ≈ 3 lines. Merging two sections is one of the biggest single wins |
| A table row | ~2 lines each once cells wrap. **Dropping one row is often what finally tips a page** |
| The renderer's provenance footer | ~3 fixed lines at the end, always present; budget for it |

⛔ **A blockquote cannot split across pages, and that is why trimming prose above it does
nothing.** `break-inside: avoid` moves the whole quote to the next page, so every line you
save above it is absorbed by the growing gap and the page count does not move. ⇒ Once a
doc ends in a big blockquote (a statement, a pull-quote), **cut the blockquote itself or the
tables next to it**, not the prose before it. The tell is a page count that refuses to drop
while the word count falls steadily.
