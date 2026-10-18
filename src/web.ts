/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * **The browser build**: review-md inside the page that shows the document, with no Node, no
 * Chromium and nothing fetched. `dist/review-md.web.js` sets `globalThis.ReviewMd`; an app
 * carries that one file and runs it in its own web view (Revenue Magnet's review window, on the
 * Mac, Windows and the iPhone), so a reader there sees exactly the page the CLI writes.
 *
 * Same renderer, theme, fonts and diagram set-up as the CLI (`render.ts`, `theme.ts`,
 * `diagram-config.ts`). The differences are only where the work happens: diagrams are drawn in
 * the page rather than pre-rendered, and local images come in as `data:` URIs the host read,
 * because a web view showing a document should not be given the disk.
 *
 * ⛔ **The document's own scripts never run.** `mount` builds the page with `DOMParser` and
 * drops every `<script>` before it is attached; the host also keeps page scripts off and runs
 * this file in an isolated world (WKContentWorld) or from outside a script-less frame. The jump
 * rail's script is ours and runs here, in this file's world.
 */

import mermaid from "mermaid";
import MarkdownIt from "markdown-it";

import { MEASURED_CUTS, MERMAID_CONFIG } from "./diagram-config.ts";
import { renderMarkdown, stripFrontmatter } from "./render.ts";
import { page, TOC_SCRIPT } from "./theme.ts";

declare const __REVIEW_MD_VERSION__: string;

export type MountOptions = {
  /** Image `src` as authored → `data:` URI. What `localImages` named and the host could read. */
  images?: Readonly<Record<string, string>>;
  /** Used when the document has no H1. */
  title?: string;
  /** The masthead's meta line and the footer, as HTML. Empty by default. */
  meta?: string;
  footer?: string;
  sectionNumbers?: boolean;
};

/** Every image the document points at on disk (not a URL, not `data:`), in document order. */
export function localImages(markdown: string): string[] {
  const out: string[] = [];
  const walk = (tokens: ReturnType<MarkdownIt["parse"]>) => {
    for (const t of tokens) {
      if (t.type === "image") {
        const src = t.attrGet("src") ?? "";
        if (src && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src) && !out.includes(src)) out.push(src);
      }
      if (t.children) walk(t.children);
    }
  };
  walk(new MarkdownIt({ html: true }).parse(stripFrontmatter(markdown), {}));
  return out;
}

/** The whole page, as the CLI writes it, with each diagram left for `drawDiagrams`. */
export function renderPage(markdown: string, options: MountOptions = {}): string {
  const rendered = renderMarkdown(markdown, {
    sourcePath: "",
    repoRoot: "",
    repoUrl: null,
    sectionNumbers: options.sectionNumbers ?? true,
    tocDepth: 2,
    diagramPlaceholders: true,
    images: options.images,
  });
  return page({
    title: rendered.title || escapeHtml(options.title ?? ""),
    standfirst: rendered.standfirst,
    meta: options.meta ?? "",
    toc: rendered.toc,
    body: rendered.body,
    footer: options.footer ?? "",
    embedFonts: true,
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let initialised = false;

/** Draw every diagram `renderPage` left in `doc`. One that mermaid rejects stays as its source. */
export async function drawDiagrams(doc: Document): Promise<number> {
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>("pre[data-review-md-diagram]"));
  if (blocks.length === 0) return 0;
  await Promise.all(MEASURED_CUTS.map((cut) => doc.fonts.load(cut).catch(() => [])));
  await doc.fonts.ready;
  if (!initialised) {
    mermaid.initialize(MERMAID_CONFIG as unknown as Parameters<typeof mermaid.initialize>[0]);
    initialised = true;
  }
  let drawn = 0;
  for (const [i, pre] of blocks.entries()) {
    try {
      const { svg } = await mermaid.render(`mmd-web-${i}`, pre.textContent ?? "");
      const holder = doc.createElement("div");
      holder.innerHTML = svg;
      const el = holder.firstElementChild;
      if (el) {
        pre.replaceWith(el);
        drawn += 1;
      }
    } catch {
      pre.classList.add("diagram-error");
    }
  }
  return drawn;
}

/**
 * Take out everything in the document that could run: scripts, frames and embeds, `on…`
 * handlers, and `javascript:` URLs. Markdown passes raw HTML through, so a draft can carry any
 * of them; the host keeps page scripts off as well, and this is the half that does not depend on
 * the host.
 */
function inert(d: Document): void {
  for (const el of Array.from(d.querySelectorAll("script, iframe, frame, object, embed, base, meta[http-equiv]"))) el.remove();
  for (const el of Array.from(d.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
      if (name.startsWith("on") || (/^(href|src|action|formaction|xlink:href)$/.test(name) && value.startsWith("javascript:"))) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/** Replace `doc` with the rendered page, run the jump rail, and draw the diagrams. */
export async function mount(doc: Document, markdown: string, options: MountOptions = {}): Promise<{ diagrams: number }> {
  const parsed = new DOMParser().parseFromString(renderPage(markdown, options), "text/html");
  inert(parsed);
  doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement);
  try {
    // Our own script, run here rather than as a page <script>, which the host keeps off.
    // The document's own window, which is not ours when the host draws into a frame from outside.
    const win = doc.defaultView ?? window;
    new Function("document", "addEventListener", "getComputedStyle", "requestAnimationFrame", TOC_SCRIPT)(
      doc,
      win.addEventListener.bind(win),
      win.getComputedStyle.bind(win),
      win.requestAnimationFrame.bind(win),
    );
  } catch {
    // The rail still works as links without it.
  }
  return { diagrams: await drawDiagrams(doc) };
}

const api = { version: __REVIEW_MD_VERSION__, localImages, renderPage, drawDiagrams, mount };
(globalThis as unknown as { ReviewMd: typeof api }).ReviewMd = api;
