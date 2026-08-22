/**
 * ```mermaid fences → inline SVG, at **build time**.
 *
 * A fence left as a code block puts `flowchart TD` source on the screen-share, which is the one
 * form of a flow nobody in the room can read.
 *
 * The constraint that decides the design: the output is **one self-contained HTML file**, opened
 * from `file://` with no network. So the diagram has to be SVG that is already in the file. That
 * rules out mermaid's usual `<script src=cdn>` + render-on-load, and it rules out shipping
 * mermaid's 3.5 MB bundle inside every render for what is often a single six-node flowchart.
 *
 * Instead: mermaid runs here, in a headless Chromium, and only its SVG output is embedded.
 * mermaid needs a real browser because layout is measured — `getBBox()`, `getComputedTextLength()`
 * — so a node box is sized from the text actually inside it. jsdom has no layout, which is why
 * the "just run it in Node" route produces labels hanging outside their boxes.
 *
 * Two consequences worth knowing:
 *
 * - **`playwright-core`, not `playwright`.** It ships no browser of its own; it uses whatever
 *   Chromium is already in the shared `~/Library/Caches/ms-playwright` (or `~/.cache/ms-playwright`)
 *   cache, so a machine that has ever run a Playwright suite pays no second 150 MB download.
 *   Nothing is installed automatically: `--no-diagrams` is a first-class answer, and a missing
 *   browser is reported as one actionable line rather than a stack trace. Note that playwright
 *   resolves a *pinned* Chromium revision — a cache populated by a much older Playwright can
 *   still miss, and the same line tells you how to fix it.
 * - **The measuring page inlines the same woff2 as the document.** Text is measured in the font
 *   it will be displayed in, or every box is sized for a font nobody sees.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

import MarkdownIt from "markdown-it";

import { fontFaceCss } from "./fonts.ts";
import { diagramTheme, TOKENS } from "./theme.ts";

const require_ = createRequire(import.meta.url);

/** The self-contained UMD build — injected as a script tag, so the page fetches nothing. */
const MERMAID_BUNDLE = "mermaid/dist/mermaid.min.js";

/** A rendered diagram, or why it didn't render. */
export type Diagram = { svg: string } | { error: string };

/**
 * The slice of the browser environment the in-page callbacks touch.
 *
 * Declared here rather than by adding `"dom"` to this tsconfig's `lib`: that would make
 * `document` and `fetch` look available to the *Node* half of the renderer as well, and the whole
 * point of this file is that the two halves run in different places. The cast is erased at
 * compile time, so what playwright ships into the page is plain `globalThis`.
 */
type PageGlobals = {
  document: {
    fonts: { load(font: string): Promise<unknown>; ready: Promise<unknown> };
    getElementById(id: string): { remove(): void } | null;
  };
  mermaid: {
    initialize(config: unknown): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
};

/** One entry per mermaid fence in the document, in document order. */
export type DocDiagrams = readonly Diagram[];

/**
 * `mermaid`, and `mermaid` with attributes after it (` mermaid title="…"`), but not `mermaidjs`.
 * Shared with the fence renderer so the ordinal a diagram is looked up by cannot drift from the
 * ordinal it was rendered at.
 */
export function isMermaidFence(info: string): boolean {
  return /^mermaid(\s|$)/.test(info.trim().toLowerCase());
}

/**
 * The mermaid sources in a document, in document order.
 *
 * Tokenised with markdown-it rather than scanned with a regex, for the same reason the footnote
 * check is: a fence inside a blockquote or a list is still a fence, and a fence inside a *longer*
 * fence is not one. Fence tokenisation doesn't depend on the plugins `render.ts` adds, so a bare
 * instance gives the same ordering the real render will walk.
 */
export function mermaidSources(markdown: string): string[] {
  return new MarkdownIt({ html: true })
    .parse(markdown, {})
    .filter((token) => token.type === "fence" && isMermaidFence(token.info))
    .map((token) => token.content);
}

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: diagramTheme(),
  fontFamily: TOKENS.body,
  /**
   * `<text>` elements, not HTML labels in a `<foreignObject>`. A foreignObject label looks fine
   * on screen and is the classic thing that comes out blank or clipped when the page is printed
   * to PDF — and this renderer's print path is half of what it's for.
   */
  htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: true },
  sequence: { useMaxWidth: true },
  state: { useMaxWidth: true },
} as const;

/**
 * The cuts mermaid measures labels in. `@font-face` is lazy — without asking for each one by
 * name, `document.fonts.ready` resolves against a page that has loaded nothing and every node box
 * gets sized for the fallback font instead of the one the reader will see.
 */
const MEASURED_CUTS = [
  '400 14px "IBM Plex Sans"',
  '500 14px "IBM Plex Sans"',
  '600 14px "IBM Plex Sans"',
] as const;

/** The measuring page: no body content, the document's own fonts, nothing fetched. */
function measuringPageHtml(): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    fontFaceCss(),
    `body{margin:0;font-family:${TOKENS.body}}`,
    "</style></head><body></body></html>",
  ].join("\n");
}

/**
 * Renders every diagram of every document in **one** browser launch (~1s of fixed cost, so a
 * per-doc launch would dominate a pack render).
 *
 * `perDoc[i]` maps to the return value's `[i]`, index for index. A diagram mermaid rejects comes
 * back as `{ error }` rather than throwing — one unparseable fence in one doc must not lose the
 * other 22 diagrams in the pack. The caller reports those and `--strict` fails on them, the same
 * contract as the footnote check.
 */
export async function renderDiagramBatch(
  perDoc: readonly (readonly string[])[],
): Promise<Diagram[][]> {
  const empty = perDoc.map(() => [] as Diagram[]);
  if (perDoc.every((sources) => sources.length === 0)) return empty;

  const bundle = readFileSync(require_.resolve(MERMAID_BUNDLE), "utf8");
  const { chromium } = await import("playwright-core");

  let browser;
  const executablePath = resolveChromium() ?? undefined;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
  } catch (cause) {
    // The overwhelmingly common cause is "no Chromium anywhere", and the stack trace
    // playwright throws for it buries the one line that fixes it. Say the line.
    throw new Error(
      `review-md: mermaid needs a headless Chromium to measure text, and it would not start.\n${chromiumHint()}`,
      { cause },
    );
  }

  try {
    const page = await browser.newPage();
    await page.setContent(measuringPageHtml());
    await page.evaluate(async (cuts: readonly string[]) => {
      const { document } = globalThis as unknown as PageGlobals;
      await Promise.all(cuts.map((cut) => document.fonts.load(cut).catch(() => [])));
      await document.fonts.ready;
    }, MEASURED_CUTS);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      (config: unknown) => {
        (globalThis as unknown as PageGlobals).mermaid.initialize(config);
      },
      MERMAID_CONFIG as unknown as Record<string, unknown>,
    );

    const out: Diagram[][] = [];
    for (const [doc, sources] of perDoc.entries()) {
      const rendered: Diagram[] = [];
      for (const [block, source] of sources.entries()) {
        // Deterministic, document-scoped id: mermaid scopes the diagram's generated CSS and its
        // arrowhead markers under it, so two diagrams on one page must not share one — and a
        // random id would make every re-render a diff.
        rendered.push(await renderDiagram(page, `mmd-${doc}-${block}`, source));
      }
      out.push(rendered);
    }
    return out;
  } finally {
    await browser.close();
  }
}

/**
 * Any Chromium already on this machine — playwright's, or the browser the user runs every day.
 *
 * We need a layout engine, not playwright's *particular* build of one. `playwright-core` ships no
 * browser and resolves a **pinned revision** inside `~/Library/Caches/ms-playwright`, so the
 * default path fails on two very ordinary machines: one that has never run a Playwright suite,
 * and one whose cache was populated by an older Playwright. Both were then told to download
 * 150 MB of Chromium — while `/Applications/Google Chrome.app` sat right there, perfectly able to
 * call `getBBox()`.
 *
 * `chromium.launch({ executablePath })` drives any Chromium-family browser, so ask in order of
 * least surprise: an explicit override, then playwright's own cache (the pinned, best-tested
 * build), then the browsers people actually have installed. Only if none of those exist is a
 * download the honest answer.
 *
 * Returns null to mean "let playwright decide", which keeps the no-override path identical to
 * what it was.
 */
function resolveChromium(): string | null {
  const override = process.env.REVIEW_MD_CHROMIUM;
  if (override) return override;

  const pinned = chromiumPath();
  if (pinned && existsSync(pinned)) return pinned;

  for (const candidate of systemChromiumCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Chromium-family browsers in their stock locations, most-likely first. */
function systemChromiumCandidates(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
  }
  if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]];
    return roots
      .filter((root): root is string => Boolean(root))
      .flatMap((root) => [
        `${root}\\Google\\Chrome\\Application\\chrome.exe`,
        `${root}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]);
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

/** Where playwright expects the browser, or null if it can't even tell us that. */
function chromiumPath(): string | null {
  try {
    // Resolved lazily and defensively: `executablePath()` throws on some installs rather than
    // returning a path, and this runs on the error path, where a second throw loses the message.
    const required = require_("playwright-core") as {
      chromium?: { executablePath?: () => string };
    };
    return required.chromium?.executablePath?.() ?? null;
  } catch {
    return null;
  }
}

/** The two lines that actually unstick a missing browser, plus where we looked. */
export function chromiumHint(): string {
  const where = chromiumPath();
  return [
    "  Point at one: REVIEW_MD_CHROMIUM=/path/to/chrome  (any Chromium-family browser works)",
    "  Or install:   npx playwright install chromium",
    "  Or skip them: pass --no-diagrams to leave ```mermaid fences as code blocks",
    where ? `  (playwright expected its own at ${where})` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * The one method {@link renderDiagram} needs from a Playwright page. Narrow on
 * purpose: it is what lets the timeout be tested with a page that never resolves,
 * without a real Chromium.
 */
export type MermaidPage = {
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
};

/**
 * Ceiling on a single diagram's render.
 *
 * The try/catch inside `page.evaluate` covers "mermaid rejects"; it cannot cover
 * "mermaid never returns", and `page.evaluate` has no default timeout of its own.
 * A pathological diagram would therefore hang `render:doc` indefinitely rather
 * than failing it. Expiry is reported as an `error`, so `--strict` treats it
 * exactly like a parse error and names the diagram.
 */
const RENDER_TIMEOUT_MS = 10_000;

// Exported for the timeout tests — `renderDiagramBatch` owns its own browser, so
// this is the only seam a fake page fits through.
export async function renderDiagram(
  page: MermaidPage,
  id: string,
  source: string,
  timeoutMs: number = RENDER_TIMEOUT_MS,
): Promise<Diagram> {
  const evaluation = page.evaluate<Diagram, { id: string; source: string }>(
    async ({ id: elementId, source: text }) => {
      const { document, mermaid } = globalThis as unknown as PageGlobals;
      try {
        const { svg } = await mermaid.render(elementId, text);
        return { svg };
      } catch (error) {
        // mermaid's parse errors carry the useful line/token detail on `message`.
        return { error: error instanceof Error ? error.message : String(error) };
      } finally {
        // A failed render leaves its scratch container behind, and a stale `#d<id>` makes a later
        // render of the same id silently reuse it.
        document.getElementById(`d${elementId}`)?.remove();
      }
    },
    { id, source },
  );

  // `Promise.race` and not an abort: there is nothing to abort into. The page is
  // shared across diagrams, so a hung evaluate keeps running — the timer only
  // stops US waiting on it. `unref()` keeps that pending timer from holding the
  // process open once every diagram has resolved.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<Diagram>((resolve) => {
    timer = setTimeout(
      () => resolve({ error: `render timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );
    timer.unref?.();
  });

  try {
    const result = await Promise.race([evaluation, expiry]);
    return "svg" in result ? { svg: tidySvg(result.svg) } : result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * mermaid emits an XHTML-flavoured `<br>` and an `aria-roledescription` that reads out as
 * "flowchart-v2" — neither belongs in a document. Everything else it emits is kept, including
 * `width="100%"` plus an inline `max-width` of the diagram's natural size: together those make
 * the SVG shrink with a narrow column without ever being blown up past what it was laid out for.
 */
function tidySvg(svg: string): string {
  return svg
    .replace(/<br\s*\/?>/g, "<br/>")
    .replace(/ aria-roledescription="[^"]*"/g, "")
    .trim();
}

/** Human-readable line for the caller's warning, matching the footnote check's shape. */
export function describeDiagramProblem(index: number, error: string): string {
  return `  mermaid diagram #${index + 1}: ${error.replace(/\s+/g, " ").trim()}`;
}
