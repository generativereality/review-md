import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { checkFootnotes } from "./footnotes.ts";
import { displayPath, normaliseRemoteUrl } from "./git.ts";
import {
  isMermaidFence,
  mermaidSources,
  renderDiagram,
  renderDiagramBatch,
  type MermaidPage,
} from "./mermaid.ts";
import { renderMarkdown, type RenderOptions } from "./render.ts";
import { diagramTheme, page, TOKENS } from "./theme.ts";

const ROOT = "/repo";
const SRC = path.join(ROOT, "docs/DOC.md");
const REPO_URL = "https://github.com/acme/widgets";

/**
 * The Chromium the mermaid path measures text in, or null. It comes from the shared Playwright
 * browser cache, so it's present on any machine that has ever run a Playwright suite — but one
 * that has never run `playwright install` should skip those two cases rather than fail a whole
 * `npm run check` on a missing binary.
 */
async function chromiumExecutable(): Promise<string | null> {
  try {
    const { chromium } = await import("playwright-core");
    const executable = chromium.executablePath();
    return executable && existsSync(executable) ? executable : null;
  } catch {
    return null;
  }
}

function options(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    sourcePath: SRC,
    repoRoot: ROOT,
    repoUrl: REPO_URL,
    sectionNumbers: true,
    tocDepth: 2,
    ...overrides,
  };
}

function render(markdown: string, overrides: Partial<RenderOptions> = {}) {
  return renderMarkdown(markdown, options(overrides));
}

describe("footnote integrity", () => {
  it("flags a duplicate definition — the failure that silently dropped a provenance note", () => {
    const problems = checkFootnotes("Body[^1] and more[^1].\n\n[^1]: first\n\n[^1]: second\n");
    const duplicate = problems.find((p) => p.kind === "duplicate-definition");
    assert.ok(duplicate, "expected a duplicate-definition problem");
    assert.equal(duplicate.label, "1");
    assert.deepEqual(duplicate.lines, [3, 5]);
  });

  it("flags a definition nothing references — the uncited-figure failure", () => {
    const problems = checkFootnotes("Body[^1].\n\n[^1]: cited\n\n[^2]: orphan\n");
    const orphan = problems.find((p) => p.kind === "unreferenced-definition");
    assert.ok(orphan);
    assert.equal(orphan.label, "2");
  });

  it("flags a reference with no definition", () => {
    const problems = checkFootnotes("Body[^7].\n");
    assert.deepEqual(
      problems.map((p) => [p.kind, p.label]),
      [["missing-definition", "7"]],
    );
  });

  it("stays quiet on a well-formed doc", () => {
    assert.deepEqual(checkFootnotes("A[^a] and B[^b].\n\n[^a]: one\n\n[^b]: two\n"), []);
  });

  it("ignores footnote-looking text inside code", () => {
    const markdown = ["Prose.", "", "```", "arr[^1] = x", "```", "", "Inline `[^2]` too."].join(
      "\n",
    );
    assert.deepEqual(checkFootnotes(markdown), []);
  });

  it("reports true line numbers after a code fence", () => {
    const markdown = [
      "```",
      "noise",
      "noise",
      "```",
      "",
      "Body[^1].",
      "",
      "[^1]: def",
      "",
      "[^1]: dup",
    ].join("\n");
    const duplicate = checkFootnotes(markdown).find((p) => p.kind === "duplicate-definition");
    assert.deepEqual(duplicate?.lines, [8, 10]);
  });
});

describe("callouts", () => {
  it("turns a glyph-led paragraph into a callout panel", () => {
    const { body } = render(
      "## H\n\n🚩 **The two largest are both gated.** That is the problem.\n",
    );
    assert.match(body, /<p class="callout callout-flag">/);
    assert.match(body, /<span class="mark mark-flag" role="img" aria-label="Flag">🚩<\/span>/);
  });

  it("hangs the callout class on the list item, not its hidden paragraph", () => {
    const { body } = render("## H\n\n- ⭐ **Key thing.** Detail.\n- Plain item.\n");
    assert.match(body, /<li class="callout callout-star">/);
    assert.doesNotMatch(body, /<p class="callout/);
  });

  it("badges a mid-sentence glyph instead of panelling the paragraph", () => {
    const { body } = render("## H\n\nThe number is real ⚠️ **but only at 25% adoption.**\n");
    assert.doesNotMatch(body, /class="callout/);
    assert.match(body, /<span class="badge badge-warn" role="img" aria-label="Caveat">⚠️<\/span>/);
  });

  it("never panels inside a table cell — a bordered panel wrecks a table", () => {
    const { body } = render("## H\n\n| A | B |\n| - | - |\n| ⏸ Permission | ✅ Approved |\n");
    assert.doesNotMatch(body, /<td[^>]*class="[^"]*callout/);
    assert.match(body, /badge badge-parked/);
    assert.match(body, /badge badge-done/);
  });

  it("lets a severity glyph win the colour when ⇒ leads the block", () => {
    const { body } = render("## H\n\n⇒ ⚠️ **On incremental cash the order inverts.**\n");
    assert.match(body, /<p class="callout callout-warn">/);
    assert.match(body, /class="therefore"/);
  });

  it("makes a bare ⇒ block a therefore callout", () => {
    const { body } = render("## H\n\n⇒ **Nothing here kills a workstream.**\n");
    assert.match(body, /<p class="callout callout-therefore">/);
  });

  it("renders every documented glyph", () => {
    const { body } = render(
      [
        "## H",
        "",
        "⭐ a",
        "",
        "🚩 b",
        "",
        "⚠️ c",
        "",
        "⛔ d",
        "",
        "⏸ e",
        "",
        "✅ f",
        "",
        "⚡ g",
      ].join("\n"),
    );
    for (const kind of ["star", "flag", "warn", "stop", "parked", "done", "zap"]) {
      assert.match(body, new RegExp(`callout callout-${kind}`), `missing callout-${kind}`);
    }
  });

  it("tolerates a missing variation selector", () => {
    const { body } = render("## H\n\n⚠ **No U+FE0F here.**\n");
    assert.match(body, /callout callout-warn/);
  });

  it("badges the glyph in a `> # …` headline box instead of panelling the heading", () => {
    // A real H1 first: the masthead split takes the doc's first H1, and `> # …` is an H1 too.
    const { body } = render("# T\n\n## H\n\n> # ⭐ The headline finding\n>\n> Why it matters.\n");
    assert.match(body, /<blockquote>\s*<h1[^>]*>/);
    assert.match(body, /<span class="badge badge-star"/);
    assert.doesNotMatch(body, /<h1[^>]*class="[^"]*callout/);
  });
});

describe("GFM surface", () => {
  it("renders task lists as real checkboxes", () => {
    const { body } = render("## H\n\n- [x] done\n- [ ] not done\n");
    assert.match(body, /<ul class="tasklist">/);
    assert.match(body, /<input type="checkbox" disabled checked>/);
    assert.match(body, /<input type="checkbox" disabled>/);
  });

  it("wraps tables so wide ones scroll instead of breaking the page", () => {
    const { body } = render("## H\n\n| A |\n| - |\n| 1 |\n");
    assert.match(body, /<div class="tablewrap">\n<table>/);
  });

  it("marks numeric cells for tabular figures", () => {
    const { body } = render("## H\n\n| Partner | Size |\n| - | - |\n| Fibrely | 5,000 |\n");
    assert.match(body, /<td class="num">5,000<\/td>/);
    assert.doesNotMatch(body, /<td class="num">Fibrely/);
  });

  it("renders footnotes with backlinks", () => {
    const { body } = render("## H\n\nClaim[^1].\n\n[^1]: Source.\n");
    assert.match(body, /class="footnote-ref"/);
    assert.match(body, /class="footnote-backref"/);
  });

  it("tags definition-style bullet lists", () => {
    const { body } = render(
      [
        "## H",
        "",
        "- **ISP** — sells internet connections.",
        "- **MVNO** — sells mobile service.",
      ].join("\n"),
    );
    assert.match(body, /<ul class="deflist">/);
  });

  it("leaves ordinary bullet lists alone", () => {
    const { body } = render(
      "## H\n\n- A per-partner **depth curve** — the assumption\n- Another item\n",
    );
    assert.doesNotMatch(body, /deflist/);
  });

  it("keeps fenced code and nested lists", () => {
    const { body } = render("## H\n\n```sql\nselect 1;\n```\n\n- a\n  - b\n");
    assert.match(body, /<pre><code class="language-sql">/);
    assert.match(body, /<li>a\n<ul>/);
  });
});

describe("masthead and nav", () => {
  it("lifts the H1 into the title and everything before the first H2 into the standfirst", () => {
    const { title, titleText, standfirst, body } = render(
      "# Q3 — Session Sheet\n\n> **Fri 2026-08-07.** One page.\n\n## First section\n\nBody.\n",
    );
    assert.equal(titleText, "Q3 — Session Sheet");
    assert.match(title, /Q3/);
    assert.match(standfirst, /<blockquote>/);
    assert.doesNotMatch(body, /<h1/);
    assert.match(body, /<h2/);
  });

  it("numbers sections and mirrors the numbers in the jump nav", () => {
    const { body, toc } = render("# T\n\n## Alpha\n\n## Beta\n");
    assert.match(body, /<span class="sec-no">§1<\/span>Alpha/);
    assert.deepEqual(
      toc.map((entry) => entry.label),
      ["§1 Alpha", "§2 Beta"],
    );
  });

  it("numbers repeated headings independently rather than collapsing them", () => {
    const { toc } = render("# T\n\n## Scale\n\n## Scale\n");
    assert.deepEqual(
      toc.map((entry) => entry.label),
      ["§1 Scale", "§2 Scale"],
    );
    assert.notEqual(toc[0].slug, toc[1].slug);
  });

  it("backs off when the doc already numbers its own sections", () => {
    const { body, toc } = render("# T\n\n## 3. Alpha\n\n## 4. Beta\n");
    assert.doesNotMatch(body, /sec-no/);
    assert.deepEqual(
      toc.map((entry) => entry.label),
      ["3. Alpha", "4. Beta"],
    );
  });

  it("honours --toc-depth 3", () => {
    const deep = render("# T\n\n## Two\n\n### Three\n", { tocDepth: 3 });
    assert.deepEqual(
      deep.toc.map((entry) => entry.level),
      [2, 3],
    );
    const shallow = render("# T\n\n## Two\n\n### Three\n");
    assert.deepEqual(
      shallow.toc.map((entry) => entry.level),
      [2],
    );
  });
});

describe("link rewriting", () => {
  it("points a sibling doc in the same pack at its local .html", () => {
    const packLinks = new Map([[path.join(ROOT, "docs/OTHER.md"), "other.html"]]);
    const { body } = render("## H\n\n[other](OTHER.md#anchor)\n", { packLinks });
    assert.match(body, /href="other\.html#anchor"/);
  });

  it("turns an in-repo .md link into a forge URL so the file works off-repo", () => {
    const { body } = render("## H\n\n[spec](../design/SPEC.md)\n");
    assert.match(body, /href="https:\/\/github\.com\/acme\/widgets\/blob\/main\/design\/SPEC\.md"/);
  });

  it("uses /tree/ for a directory link", () => {
    const { body } = render("## H\n\n[dir](../design/review-2026-08/)\n");
    assert.match(body, /\/tree\/main\/design\/review-2026-08"/);
  });

  // Standalone, there is often no remote — a scratch directory, a checkout with no origin. The
  // renderer must still produce the document; it just can't invent a URL for an in-repo link.
  it("leaves an in-repo .md link exactly as authored when there is no repo URL", () => {
    const { body } = render("## H\n\n[spec](../design/SPEC.md)\n", { repoUrl: null });
    assert.match(body, /href="\.\.\/design\/SPEC\.md"/);
    assert.doesNotMatch(body, /github\.com/);
  });

  it("still cross-links pack siblings with no repo URL — a pack is self-contained", () => {
    const packLinks = new Map([[path.join(ROOT, "docs/OTHER.md"), "other.html"]]);
    const { body } = render("## H\n\n[other](OTHER.md)\n", { packLinks, repoUrl: null });
    assert.match(body, /href="other\.html"/);
  });

  it("does not autolink a filename mentioned in prose (.md is a real TLD)", () => {
    const { body } = render("## H\n\nSame rule for ROADMAP.md and NEXT-STEPS.md.\n");
    assert.doesNotMatch(body, /<a /);
  });

  it("still autolinks a bare URL that has a scheme", () => {
    const { body } = render("## H\n\nSee https://example.com/state-of-the-thing-2026/ for it.\n");
    assert.match(body, /<a href="https:\/\/example\.com\/state-of-the-thing-2026\/">/);
  });

  it("leaves external links, anchors and non-markdown targets exactly as authored", () => {
    const { body } = render(
      "## H\n\n[x](https://example.com/) [y](#section) [z](../design/deck.html)\n",
    );
    assert.match(body, /href="https:\/\/example\.com\/"/);
    assert.match(body, /href="#section"/);
    assert.match(body, /href="\.\.\/design\/deck\.html"/);
  });
});

describe("the whole page", () => {
  const shell = (markdown: string) => {
    const rendered = render(markdown);
    return page({
      title: rendered.title,
      kicker: "kicker",
      bannerLeft: "left",
      bannerRight: "right",
      standfirst: rendered.standfirst,
      meta: "meta",
      toc: rendered.toc,
      body: rendered.body,
      footer: "footer",
      embedFonts: true,
    });
  };
  const built = () => shell("# Title\n\n> Stand.\n\n## One\n\nBody ⚠️ **caveat.**\n");
  /** Two H2s: below that the nav isn't worth the room and `page()` drops it. */
  const builtWithNav = () => shell("# Title\n\n> Stand.\n\n## One\n\nBody.\n\n## Two\n\nMore.\n");

  it("fetches nothing at view time — it has to open from file:// offline", () => {
    const html = built();
    assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet/i);
    assert.doesNotMatch(html, /@import/i);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
    assert.doesNotMatch(html, /<img[^>]+src=["']?https?:/i);
  });

  it("inlines the fonts and the print stylesheet", () => {
    const html = built();
    assert.match(html, /@font-face\{font-family:"Fraunces"/);
    assert.match(html, /src:url\(data:font\/woff2;base64,/);
    assert.match(html, /@media print/);
  });

  it("renders one banner with both sides, and the sticky jump nav", () => {
    const html = built();
    assert.match(html, /<span class="left">left<\/span>/);
    assert.match(html, /<span class="right"><b>right<\/b><\/span>/);
    assert.match(html, /<p class="kicker">kicker<\/p>/);
  });

  it("puts the jump nav in a sticky right-hand rail beside the body", () => {
    const html = builtWithNav();
    assert.match(html, /<div class="layout">\n<nav class="toc"/);
    assert.match(html, /grid-template-areas:"body nav"/);
    assert.match(html, /\.toc\{[^}]*grid-area:nav;\s*position:sticky/);
  });

  it("collapses the rail to the sticky top bar when the window is too narrow for it", () => {
    const html = builtWithNav();
    // --toc-mode is what the inlined script reads, so the breakpoint lives in the CSS only.
    assert.match(html, /@media \(max-width:64rem\)\{\s*\.layout\{display:block\}/);
    assert.match(html, /--toc-mode:bar/);
    assert.match(html, /getPropertyValue\('--toc-mode'\)/);
  });

  it("makes the phone bar one sideways-scrolling row rather than a capped wrapped block", () => {
    const html = builtWithNav();
    const phone = html.slice(html.indexOf("@media (max-width:48rem){"));
    // Measured at 390×844 on the drop-off doc: the wrapped bar hit its 26vh cap at 219px — a
    // quarter of the screen on every scroll position, with the last entry sliced through the
    // middle. One nowrap row is 40px and never clips a label.
    assert.match(phone, /\.toc\{[^}]*flex-wrap:nowrap/);
    assert.match(phone, /\.toc\{[^}]*overflow-x:auto/);
    assert.match(phone, /\.toc\{[^}]*max-height:none/);
    // …and the highlight has to follow it on the other axis, or the current section sits off-screen.
    assert.match(html, /nav\.scrollLeft/);
  });

  it("reserves no rail column when the doc is too short to earn a nav", () => {
    const html = built();
    assert.doesNotMatch(html, /class="layout"/);
    assert.doesNotMatch(html, /<nav class="toc"/);
  });

  it("drops the nav in print and un-grids the layout so the body prints full width", () => {
    const html = builtWithNav();
    const print = html.slice(html.indexOf("@media print{"));
    assert.match(print, /\.toc, \.ghost\{display:none\}/);
    assert.match(print, /\.layout\{display:block\}/);
  });

  it("sets a `> # …` headline box below page-title scale", () => {
    const html = builtWithNav();
    const inQuote = /^blockquote h1\{font:\d+ ([\d.]+)rem/m.exec(html);
    assert.ok(inQuote, "expected a blockquote h1 rule — `> # …` is a callout, not a page title");
    assert.ok(
      Number(inQuote[1]) < 2,
      `a headline box should read as a callout heading, got ${inQuote[1]}rem`,
    );
    const h2 = /^h2\{font:\d+ ([\d.]+)rem/m.exec(html);
    assert.ok(h2 && Number(h2[1]) < 1.6, `h2 should stay under 1.6rem, got ${h2?.[1]}rem`);
  });

  it("escapes the title into <title> rather than emitting its markup", () => {
    const html = page({
      title: "A <em>B</em> & C",
      standfirst: "",
      meta: "",
      toc: [],
      body: "",
      footer: "",
      embedFonts: false,
    });
    assert.match(html, /<title>A &lt;em&gt;B&lt;\/em&gt; &amp; C<\/title>/);
    assert.match(html, /<h1>A <em>B<\/em> & C<\/h1>/);
  });
});

describe("mermaid diagrams", () => {
  const FLOWCHART = 'graph LR\n  A["One"] --> B["Two"]';

  it("picks up the mermaid fences in document order and leaves other fences alone", () => {
    const markdown = [
      "# T",
      "",
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "```mermaid",
      "sequenceDiagram",
      "  A ->> B: hi",
      "```",
      "",
    ].join("\n");
    assert.deepEqual(mermaidSources(markdown), [
      "graph LR\n  A --> B\n",
      "sequenceDiagram\n  A ->> B: hi\n",
    ]);
  });

  it("sees a fence inside a blockquote and ignores mermaid-looking text inside a longer fence", () => {
    const markdown = [
      "# T",
      "",
      "> ```mermaid",
      "> graph TD",
      "> ```",
      "",
      "````",
      "```mermaid",
      "graph LR",
      "```",
      "````",
      "",
    ].join("\n");
    assert.deepEqual(mermaidSources(markdown), ["graph TD\n"]);
  });

  it("matches the mermaid info string but not a language that merely starts with it", () => {
    assert.ok(isMermaidFence("mermaid"));
    assert.ok(isMermaidFence("  mermaid  "));
    assert.ok(isMermaidFence('mermaid title="x"'));
    assert.ok(!isMermaidFence("mermaidjs"));
    assert.ok(!isMermaidFence("ts"));
  });

  it("swaps a rendered fence for inline SVG in a figure, and keeps other fences as code", () => {
    const html = render("# T\n\n## S\n\n```mermaid\ngraph LR\n```\n\n```ts\nconst x = 1;\n```\n", {
      diagrams: [{ svg: "<svg id='mmd-0-0'>DIAGRAM</svg>" }],
    }).body;
    assert.match(html, /<figure class="diagram">\s*<svg id='mmd-0-0'>DIAGRAM<\/svg>/);
    assert.match(html, /<code class="language-ts">/);
    assert.doesNotMatch(html, /language-mermaid/);
  });

  it("shows the source when mermaid rejected the diagram — the honest degradation", () => {
    const html = render("# T\n\n## S\n\n```mermaid\ngraph LR\n  A -->\n```\n", {
      diagrams: [{ error: "Parse error on line 2" }],
    }).body;
    assert.match(html, /<code class="language-mermaid">/);
    assert.doesNotMatch(html, /<figure class="diagram">/);
  });

  it("shows the source when nothing rendered the fences at all (--no-diagrams)", () => {
    const html = render("# T\n\n## S\n\n```mermaid\ngraph LR\n```\n").body;
    assert.match(html, /<code class="language-mermaid">/);
  });

  /**
   * The reason the ordinal is stamped on the token rather than counted as the renderer walks:
   * the renderer is handed the standfirst and the body as separate slices, so a diagram above
   * the first H2 would shift every later lookup by one if a running counter were used.
   */
  it("keeps the ordinal right when a diagram sits in the standfirst, above the first H2", () => {
    const rendered = render(
      "# T\n\n```mermaid\ngraph LR\n```\n\n## S\n\n```mermaid\ngraph TD\n```\n",
      {
        diagrams: [{ svg: "<svg>STAND</svg>" }, { svg: "<svg>BODY</svg>" }],
      },
    );
    assert.match(rendered.standfirst, /<svg>STAND<\/svg>/);
    assert.match(rendered.body, /<svg>BODY<\/svg>/);
    assert.doesNotMatch(rendered.body, /STAND/);
  });

  it("takes every diagram colour from the theme, so a diagram cannot drift from its document", () => {
    const theme = diagramTheme();
    // Every colour it sets must be a token — mermaid's stock base theme is lavender on white,
    // which would read as a screenshot from another document.
    const palette = new Set(Object.values(TOKENS));
    const colours = Object.entries(theme).filter(([, value]) => value.startsWith("#"));
    assert.ok(colours.length > 20, `expected the theme to pin its palette, got ${colours.length}`);
    for (const [key, value] of colours) {
      assert.ok(
        palette.has(value as (typeof TOKENS)[keyof typeof TOKENS]),
        `${key}=${value} is not a theme token`,
      );
    }
    assert.equal(theme.fontFamily, TOKENS.body);
  });

  it("styles the figure for screen and for print, and keeps the page fetching nothing", () => {
    const html = page({
      title: "T",
      standfirst: "",
      meta: "",
      toc: [],
      body: '<figure class="diagram"><svg id="mmd-0-0"><text>x</text></svg></figure>',
      footer: "",
      embedFonts: false,
    });
    assert.match(html, /figure\.diagram\{/);
    // Fit-to-page rather than sliced by the page break.
    assert.match(html, /figure\.diagram svg\{max-height:\d+mm\}/);
    assert.match(
      html,
      /figure\.diagram\{break-inside:avoid\}|, figure\.diagram\{break-inside:avoid\}/,
    );
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
  });

  it("renders a real diagram to inline SVG carrying the document's own ink and font", async (t) => {
    const executable = await chromiumExecutable();
    if (!executable) {
      t.skip("no Chromium — run `npx playwright install chromium` to cover this path");
      return;
    }

    const [[diagram]] = await renderDiagramBatch([[FLOWCHART]]);
    assert.ok(diagram && "svg" in diagram, `expected an SVG, got ${JSON.stringify(diagram)}`);
    const svg = diagram.svg;
    assert.match(svg, /^<svg id="mmd-0-0"/);
    // Real layout ran: the labels are <text>, not a foreignObject that prints blank, and the
    // viewBox proves text was measured rather than guessed.
    assert.match(svg, /<text/);
    assert.doesNotMatch(svg, /foreignObject/);
    assert.match(svg, /viewBox="0 0 \d/);
    assert.ok(svg.includes("One") && svg.includes("Two"), "the node labels should be in the SVG");
    // Themed from theme.ts, not from mermaid's stock palette.
    assert.ok(svg.includes(TOKENS.ink), "node text should be the document ink");
    assert.ok(svg.includes("IBM Plex Sans"), "labels should be set in the document's body font");
    assert.doesNotMatch(svg, /aria-roledescription/);
  });

  it("reports a broken diagram instead of throwing away the whole batch", async (t) => {
    const executable = await chromiumExecutable();
    if (!executable) {
      t.skip("no Chromium — run `npx playwright install chromium` to cover this path");
      return;
    }

    const [first, second] = await renderDiagramBatch([["graph LR\n  A --> --> B"], [FLOWCHART]]);
    assert.ok(
      first[0] && "error" in first[0],
      "the malformed diagram should come back as an error",
    );
    assert.ok(second[0] && "svg" in second[0], "a later doc's diagram must still render");
  });
});

describe("renderDiagram timeout", () => {
  // The in-page try/catch covers "mermaid rejects"; it cannot cover "mermaid
  // never returns", and page.evaluate has no default timeout. Without a ceiling
  // one pathological diagram hangs the whole render:doc run instead of failing
  // it. These use a fake page, so they need no Chromium and always run in CI.
  // Resolves LATER than the ceiling rather than never. A never-settling promise
  // would leak past the test and node:test fails the suite with "Promise
  // resolution is still pending but the event loop has already resolved" — which
  // is the runner correctly objecting to an unsettleable handle, not a flake.
  // Late-but-settling exercises the same race.
  const slowPage = (delayMs: number): MermaidPage => ({
    evaluate: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ svg: "<svg/>" } as never), delayMs);
      }),
  });

  it("reports a never-returning render as an error rather than hanging", async () => {
    const result = await renderDiagram(slowPage(200), "mmd-0-0", "graph TD; A-->B", 15);
    assert.ok("error" in result, "a hung render must come back as an error");
    assert.match(result.error, /timed out after 15ms/);
  });

  it("is reported the same way a parse error is, so --strict names it", async () => {
    const result = await renderDiagram(slowPage(200), "mmd-0-0", "graph TD; A-->B", 15);
    assert.ok("error" in result);
    // describeDiagramProblem is what --strict prints; it must accept this shape.
    assert.ok(typeof result.error === "string" && result.error.length > 0);
  });

  it("does not penalise a render that finishes inside the ceiling", async () => {
    const fastPage: MermaidPage = {
      evaluate: async () => ({ svg: "<svg><br/></svg>" }) as never,
    };
    const result = await renderDiagram(fastPage, "mmd-0-0", "graph TD; A-->B", 5_000);
    assert.ok("svg" in result, "a prompt render must pass through");
  });

  it("still surfaces a rejecting page as an error, not a timeout", async () => {
    const rejectingPage: MermaidPage = {
      evaluate: () => Promise.reject(new Error("browser went away")),
    };
    await assert.rejects(
      () => renderDiagram(rejectingPage, "mmd-0-0", "graph TD; A-->B", 5_000),
      /browser went away/,
    );
  });
});

describe("repo provenance, derived not hardcoded", () => {
  // The renderer used to bake one product repo's URL in as a constant, which put that repo's
  // GitHub links into every artifact anyone rendered anywhere. It is derived per document now,
  // from the remote of the repo the *source file* lives in.
  it("normalises the scp-style remote git actually hands back for an SSH clone", () => {
    assert.equal(
      normaliseRemoteUrl("git@github.com:acme/widgets.git", (h) => h),
      "https://github.com/acme/widgets",
    );
  });

  it("normalises an ssh:// remote", () => {
    assert.equal(
      normaliseRemoteUrl("ssh://git@github.com/acme/widgets.git", (h) => h),
      "https://github.com/acme/widgets",
    );
  });

  it("strips the .git suffix and any trailing slash from an https remote", () => {
    assert.equal(normaliseRemoteUrl("https://github.com/acme/widgets.git/"), "https://github.com/acme/widgets");
  });

  // Multi-account git clones through a ~/.ssh/config alias, and the alias is not a hostname.
  it("resolves an SSH host alias to the real hostname", () => {
    const aliases: Record<string, string> = { "github.motin": "github.com" };
    const resolve = (host: string) => aliases[host] ?? host;
    assert.equal(
      normaliseRemoteUrl("git@github.motin:generativereality/cctabs.git", resolve),
      "https://github.com/generativereality/cctabs",
    );
    assert.equal(
      normaliseRemoteUrl("ssh://git@github.motin/generativereality/cctabs.git", resolve),
      "https://github.com/generativereality/cctabs",
    );
  });

  it("leaves an https host alone — it is already a real hostname", () => {
    const explode = () => assert.fail("https remotes must not be run through the ssh resolver");
    assert.equal(
      normaliseRemoteUrl("https://github.com/acme/widgets.git", explode),
      "https://github.com/acme/widgets",
    );
  });

  it("keeps a self-hosted host and a nested group path", () => {
    assert.equal(
      normaliseRemoteUrl("git@gitlab.example.com:group/sub/widgets.git", (h) => h),
      "https://gitlab.example.com/group/sub/widgets",
    );
  });

  it("drops embedded credentials — a rendered doc gets handed to other people", () => {
    assert.equal(
      normaliseRemoteUrl("https://user:token@github.com/acme/widgets.git"),
      "https://github.com/acme/widgets",
    );
  });

  it("returns null for remotes there is no browsable URL for", () => {
    assert.equal(normaliseRemoteUrl(""), null);
    assert.equal(normaliseRemoteUrl("   "), null);
    assert.equal(normaliseRemoteUrl("/srv/git/widgets.git", (h) => h), null);
    assert.equal(normaliseRemoteUrl("file:///srv/git/widgets.git"), null);
  });

  it("shows a doc under the root by its relative path", () => {
    assert.equal(displayPath("/repo", "/repo/docs/DOC.md"), "docs/DOC.md");
  });

  it("falls back to the basename rather than a ../../.. path nobody can act on", () => {
    assert.equal(displayPath("/repo/docs", "/elsewhere/NOTES.md"), "NOTES.md");
  });
});
