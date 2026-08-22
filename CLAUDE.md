# render-doc

Markdown → one self-contained styled HTML file (`@generativereality/render-doc`, bin `render-doc`).
See `README.md` and `skills/render-doc/SKILL.md` — the SKILL is the design contract and the list of
traps; read it before changing behaviour.

## Versioning policy — READ THIS

**The renderer itself is the feature.** Rounding it out and fixing it are *bug fixes*:

- **Adding a missing capability** (a flag, a markdown construct, a print fix) or **fixing a
  shortcoming** → **patch** release (`0.x.Z+1`). These are *not* "new features" — they're
  completing the tool.
- **A genuinely new feature beyond that** → minor (`0.Y+1.0`). Rare. Flag it and confirm first.
- Major → reserved for 1.0 / breaking changes.

## Publishing — ONLY on explicit user go-ahead

**Never `npm publish` (or bump versions to publish) on your own initiative.** Default loop:

1. Make the change in `src/`.
2. `npm run check` (typecheck + tests + build), then render a real doc with
   **`node dist/index.js <doc.md>`** and **open it in `browser-automation`**. A ✓ is not a look —
   see the SKILL's ⭐ rule.
3. `git commit` locally.
4. **Tell the user what's staged & unpublished. Wait for an explicit "publish".**

When the user says publish:

1. Bump the version in **both** `package.json` and `.claude-plugin/plugin.json` (keep in sync).
2. `git commit && git push`.
3. `npm publish` (granular npmjs token in `~/.npmrc`; never prompt for OTP).
4. `npm run sync-plugin` — syncs `plugin.json` + `SKILL.md` to `../plugins`, commits, pushes.

⚠️ **`npm publish` needs `registry.npmjs.org` reachable.** Some networks don't allow it —
`curl https://registry.npmjs.org/` failing with exit 35 is the tell. Publish from one that does.

## Git identity

Commits go as **`Motin <motin@motin.eu>`**. Set `user.name`/`user.email` **locally** — the
global git config may well be a different identity. Same for `gh`: `gh auth switch --user motin`
before any `gh` call against `generativereality/*`.

## Dev gotchas

- **`@types/markdown-it` is pinned to exactly `14.1.2`, and `moduleResolution` is `bundler`.**
  14.2.0 ships separate CJS and ESM type entries; `@types/markdown-it-footnote` pulls the CJS one
  in via `import = require`, and the two `MarkdownIt` types are structurally incompatible, so
  `md.use(footnote)` stops typechecking. Both halves of the workaround are load-bearing — don't
  "tidy" either without re-running `npm run typecheck`.
- **The shebang lives in `src/index.ts`**, not in a tsdown `banner`, so `tsx src/index.ts` and the
  built `dist/index.js` are executable the same way and there is only ever one of them.
- **Deps stay external, deliberately.** `mermaid` (3.5 MB) and the `@fontsource*` woff2 payloads
  are read off disk at runtime via `createRequire(import.meta.url)`. Bundling them into `dist`
  would be slower to install and no more self-contained — the *output* is what has to be
  self-contained, not the tool.
- The agent shell runs with `set -e -o pipefail` — a `grep` with no match aborts a chained script.
  Append `|| true` to verification greps in release sequences.
- Diagram tests skip without a Chromium in the Playwright cache. `npx playwright install chromium`
  covers them; `node node_modules/playwright-core/cli.js install chromium` works too.

## Key files

- `src/index.ts` — CLI: arg parsing, single-doc and pack paths, the one-launch diagram pre-pass.
- `src/theme.ts` — **the single source of visual truth.** Tokens, type scale, page shell, print
  rules, and `diagramTheme()`. A test asserts every diagram colour comes from a token; keep it.
- `src/render.ts` — markdown-it setup, masthead/standfirst/body split, TOC, link rewriting.
- `src/callouts.ts` — the glyph convention: leading → panel, inline/in-cell → badge.
- `src/mermaid.ts` — fences → inline SVG in one headless Chromium; per-diagram timeout.
- `src/git.ts` — repo root, origin remote → https base, revision. **Nothing here throws**; no repo
  is an ordinary outcome, and the renderer must still produce a document.
- `src/footnotes.ts` — the integrity check (duplicate / orphaned / undefined).
- `src/manifest.ts` — pack manifests and the generated `index.html` cover.
- `src/render-doc.test.ts` — the whole suite (`npm test`).
- `skills/render-doc/SKILL.md` — the Claude Code skill (synced to `generativereality/plugins`).
- `.claude-plugin/plugin.json` — manifest; version must match `package.json`.
