/**
 * Markdown → the document body, TOC and masthead parts.
 *
 * GFM surface: tables, footnotes with backlinks, fenced code, task lists, nested lists,
 * blockquotes — plus the callout glyph convention (see `callouts.ts`).
 */

import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import Token from "markdown-it/lib/token.mjs";
import path from "node:path";

import { calloutsPlugin } from "./callouts.ts";
import { isMermaidFence, type DocDiagrams } from "./mermaid.ts";
import type { TocEntry } from "./theme.ts";

export type RenderOptions = {
  /** Absolute path of the source markdown, for resolving relative links. */
  sourcePath: string;
  /** Absolute repo root, so in-repo links can become forge URLs. */
  repoRoot: string;
  /**
   * Base URL of the repo the source lives in (`https://github.com/owner/repo`), or null when
   * there is no remote — or no repo at all. Null leaves in-repo `.md` links exactly as authored,
   * which is the honest degradation: a link to a file nobody can reach is worse than a dead
   * relative one, because it looks like it works.
   */
  repoUrl: string | null;
  /** Absolute source path → href to use instead (a sibling doc in the same pack). */
  packLinks?: Map<string, string>;
  /** Prefix H2s with `§1`, `§2`, …. */
  sectionNumbers: boolean;
  /** Deepest heading level in the jump nav (2 or 3). */
  tocDepth: 2 | 3;
  /**
   * Pre-rendered SVG for this document's ```mermaid fences, in document order — see
   * `mermaid.ts` on why they can't be rendered from inside markdown-it. A fence with no entry
   * (or a failed one) falls back to the fenced-code rendering.
   */
  diagrams?: DocDiagrams;
};

export type RenderedDoc = {
  /** Rendered from the first H1 (inline HTML, so emphasis survives). */
  title: string;
  /** Plain-text title, for <title>. */
  titleText: string;
  /** Everything between the H1 and the first H2. */
  standfirst: string;
  body: string;
  toc: TocEntry[];
};

const NUMERIC_CELL = /^[\s\d.,%€$£+×~/–—-]*\d[\s\d.,%€$£+×~/–—-]*$/;
const MAX_TOC_LABEL = 44;

function plainText(inline: Token): string {
  return (inline.children ?? [])
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join("");
}

function truncateLabel(text: string): string {
  if (text.length <= MAX_TOC_LABEL) return text;
  const cut = text.slice(0, MAX_TOC_LABEL);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_TOC_LABEL * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section"
  );
}

/**
 * Relative `.md` links (and links to repo directories) are dead in a standalone HTML file. Two
 * fixes: a sibling doc rendered into the same pack becomes a local `.html` link, so the pack is
 * navigable offline; anything else inside the repo becomes a forge URL, so the artifact still
 * works on someone else's laptop.
 *
 * Links to anything else — `.html`, images, assets — are left exactly as authored. GitHub can't
 * preview an HTML blob, so rewriting those would trade a dead link for a useless one.
 */
function rewriteHref(href: string, options: RenderOptions): string {
  if (/^([a-z]+:|#|\/\/)/i.test(href)) return href;

  const [target, hash = ""] = href.split("#");
  if (target === "") return href;
  if (!/\.md$|\/$/.test(target)) return href;

  const absolute = path.resolve(path.dirname(options.sourcePath), target);
  const packHref = options.packLinks?.get(absolute);
  if (packHref) return hash ? `${packHref}#${hash}` : packHref;

  // No known remote — leave it as authored. See `repoUrl`.
  if (!options.repoUrl) return href;

  const repoRelative = path.relative(options.repoRoot, absolute);
  if (repoRelative.startsWith("..") || path.isAbsolute(repoRelative)) return href;

  const kind = target.endsWith("/") ? "tree" : "blob";
  const suffix = hash ? `#${hash}` : "";
  return `${options.repoUrl}/${kind}/main/${repoRelative.split(path.sep).join("/")}${suffix}`;
}

const SELF_NUMBERED_HEADING = /^\s*(§|\d+[a-z]?\s*[.)]|step\s+\d|part\s+\d)/i;

/**
 * Some docs number their own sections (`## 4. The haircut the model does not carry`). Prefixing
 * those with `§4` renders "§4 4." — so back off when the doc is already doing it.
 * `--no-section-numbers` still forces it off everywhere.
 */
function numbersItsOwnSections(tokens: Token[], from: number): boolean {
  const headings: string[] = [];
  for (let i = from; i < tokens.length; i += 1) {
    if (tokens[i].type !== "heading_open" || tokens[i].tag !== "h2") continue;
    const inline = tokens[i + 1];
    if (inline?.type === "inline") headings.push(plainText(inline));
  }
  if (headings.length < 2) return false;
  const numbered = headings.filter((heading) => SELF_NUMBERED_HEADING.test(heading)).length;
  return numbered >= headings.length / 2;
}

function buildMarkdownIt(options: RenderOptions): { md: MarkdownIt; toc: TocEntry[] } {
  const toc: TocEntry[] = [];

  const md = new MarkdownIt({
    // Repo docs are trusted, first-party content; many already embed raw <br>/<span>.
    html: true,
    linkify: true,
    // Off deliberately: the docs already use typographic quotes, and typographer would
    // reinterpret `--flag` as an en dash (and it is the rule with the ReDoS history).
    typographer: false,
  });

  // Scheme-only autolinking. markdown-it's "fuzzy" linkifier autolinks bare domains, and `.md`
  // is a real TLD (Moldova) — so a doc that mentions `ROADMAP.md` in prose without backticks got
  // a live `http://ROADMAP.md` link. Same trap for `.co`, `.it`, `.sh`, and a bare
  // `someone@example.com` becoming a mailto. Explicit `https://…` links still autolink.
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

  md.use(footnote);
  md.use(anchor, {
    slugify,
    tabIndex: false,
    callback: (token, info) => {
      const level = Number(token.tag.slice(1));
      if (level >= 2 && level <= options.tocDepth) {
        toc.push({ level, slug: info.slug, title: info.title, label: info.title });
      }
    },
  });
  md.use(calloutsPlugin);

  // Numeric cells get tabular figures — these docs are table-heavy and columns of € and %
  // read badly proportional.
  md.core.ruler.push("render_doc_numeric_cells", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== "td_open") continue;
      const inline = tokens[i + 1];
      if (inline?.type === "inline" && NUMERIC_CELL.test(plainText(inline))) {
        const existing = tokens[i].attrGet("class");
        tokens[i].attrSet("class", existing ? `${existing} num` : "num");
      }
    }
  });

  // Numbering the mermaid fences on the tokens, rather than counting them as the renderer walks
  // past, is what keeps the ordinal correct: the renderer is handed *slices* of the stream (the
  // standfirst, then the body) and never sees anything above the H1 at all, so a running counter
  // would drift the moment a doc opened with a diagram.
  md.core.ruler.push("render_doc_mermaid_index", (state) => {
    let index = 0;
    for (const token of state.tokens) {
      if (token.type !== "fence" || !isMermaidFence(token.info)) continue;
      token.meta = { ...(token.meta ?? {}), mermaidIndex: index };
      index += 1;
    }
  });

  // Tables scroll horizontally rather than blowing out the page width.
  md.renderer.rules.table_open = () => '<div class="tablewrap">\n<table>\n';
  md.renderer.rules.table_close = () => "</table>\n</div>\n";

  const defaultFence =
    md.renderer.rules.fence ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const index: unknown = token.meta?.mermaidIndex;
    const diagram = typeof index === "number" ? options.diagrams?.[index] : undefined;
    // No SVG — mermaid rejected it, --no-diagrams was passed, or nothing rendered this doc's
    // fences. Showing the source is the honest degradation; the caller warns about the failure.
    if (!diagram || !("svg" in diagram)) return defaultFence(tokens, idx, opts, env, self);
    return `<figure class="diagram">\n${diagram.svg}\n</figure>\n`;
  };

  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = tokens[idx].attrGet("href");
    if (href) tokens[idx].attrSet("href", rewriteHref(href, options));
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  return { md, toc };
}

export function renderMarkdown(markdown: string, options: RenderOptions): RenderedDoc {
  const { md, toc } = buildMarkdownIt(options);
  const env: Record<string, unknown> = {};
  const tokens = md.parse(markdown, env);

  // Split at the structural seams: H1 → masthead title, everything up to the first H2 →
  // standfirst, the rest → body.
  const h1Open = tokens.findIndex((token) => token.type === "heading_open" && token.tag === "h1");
  const h1Inline = h1Open >= 0 ? tokens[h1Open + 1] : undefined;
  const afterH1 = h1Open >= 0 ? h1Open + 3 : 0;
  const firstH2 = tokens.findIndex(
    (token, index) => index >= afterH1 && token.type === "heading_open" && token.tag === "h2",
  );
  const bodyStart = firstH2 >= 0 ? firstH2 : afterH1;

  if (options.sectionNumbers && !numbersItsOwnSections(tokens, bodyStart)) {
    // The anchor plugin pushes TOC entries in document order, so the Nth level-2 entry is the
    // Nth H2 — matching on title would collide on repeated headings.
    const sections = toc.filter((entry) => entry.level === 2);
    let section = 0;
    for (let i = bodyStart; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type !== "heading_open" || token.tag !== "h2") continue;
      const inline = tokens[i + 1];
      if (inline?.type !== "inline") continue;
      section += 1;
      const marker = new Token("html_inline", "", 0);
      marker.content = `<span class="sec-no">§${section}</span>`;
      inline.children = [marker, ...(inline.children ?? [])];
      const entry = sections[section - 1];
      if (entry) entry.label = `§${section} ${entry.label}`;
    }
  }

  const render = (slice: Token[]): string => md.renderer.render(slice, md.options, env).trim();

  const title = h1Inline ? md.renderer.renderInline(h1Inline.children ?? [], md.options, env) : "";

  for (const entry of toc) entry.label = truncateLabel(entry.label);

  return {
    title,
    titleText: h1Inline ? plainText(h1Inline) : "",
    standfirst: render(tokens.slice(afterH1, bodyStart)),
    body: render(tokens.slice(bodyStart)),
    toc,
  };
}
