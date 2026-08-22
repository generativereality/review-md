/**
 * The document theme — tokens, type scale and page shell.
 *
 * One visual language, so a folder of renders reads as one pack: cream paper with a fine dot
 * texture, Fraunces for display, IBM Plex Sans/Mono for body and code, a rust accent, a dark
 * two-sided banner, a sticky jump nav.
 *
 * **This file is the single source of visual truth.** Every colour, size and rule in a render
 * comes from here — including the mermaid diagram palette, via `diagramTheme()`. Change a token
 * and every document moves together; change one output file and you have a fork nobody can
 * maintain. The skill's token table and type scale mirror what is here; keep them in step.
 *
 * Two decisions worth knowing, both about **long** documents rather than about look: the jump nav
 * is a **sticky right-hand rail** (a 31-entry horizontal bar wrapped to twelve rows and ate most
 * of the screen), collapsing to a sticky top bar when the window is too narrow for a rail; and
 * the display sizes sit a notch below what a projected briefing would use, because a repo doc is
 * read at desk distance.
 *
 * This is a *document* theme, not a deck theme. Documents and slides are different jobs, and
 * neither type scale survives being forced onto the other surface — don't merge them.
 */

import { CALLOUTS, type CalloutKind } from "./callouts.ts";
import { fontFaceCss } from "./fonts.ts";

/**
 * The palette and the font stacks, as data. `:root` below is generated from this, and so is the
 * mermaid theme in `diagramTheme()` — a diagram is part of the document, so its colours have to
 * come from here rather than from mermaid's stock lavender.
 */
export const TOKENS = {
  paper: "#faf7f0",
  paperDeep: "#f3eee2",
  paperCard: "#fffdf7",
  ink: "#231f18",
  ink2: "#5c554a",
  ink3: "#8a8172",
  accent: "#8c2f1b",
  accentSoft: "#f4e3dd",
  rule: "#d9d2c2",
  ruleSoft: "#e8e2d3",
  display: '"Fraunces",Georgia,"Times New Roman",serif',
  body: '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif',
  mono: '"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
} as const;

/**
 * mermaid `themeVariables` for `theme: "base"`, derived from `TOKENS`.
 *
 * Set explicitly rather than left to mermaid's derivation from `primaryColor`: the base theme
 * computes borders and secondary fills by rotating hue, which pulls a cream-paper document
 * towards mauve. The two contrast decisions that matter are for **paper**: node fills are near
 * white, so the border is `ink-3` and edges are `ink-2` (not `--rule`, which vanishes at 10.5pt
 * on a printed page), and every label is full `ink`.
 */
export function diagramTheme(): Record<string, string> {
  const t = TOKENS;
  return {
    // flowchart / graph
    background: t.paperDeep,
    primaryColor: t.paperCard,
    primaryTextColor: t.ink,
    primaryBorderColor: t.ink3,
    secondaryColor: t.paperDeep,
    secondaryTextColor: t.ink,
    secondaryBorderColor: t.rule,
    tertiaryColor: t.paperDeep,
    tertiaryTextColor: t.ink,
    tertiaryBorderColor: t.rule,
    mainBkg: t.paperCard,
    nodeBorder: t.ink3,
    nodeTextColor: t.ink,
    textColor: t.ink,
    titleColor: t.ink,
    lineColor: t.ink2,
    edgeLabelBackground: t.paperDeep,
    clusterBkg: t.paperDeep,
    clusterBorder: t.rule,
    defaultLinkColor: t.ink2,
    // sequenceDiagram
    actorBkg: t.paperCard,
    actorBorder: t.ink3,
    actorTextColor: t.ink,
    actorLineColor: t.ink3,
    signalColor: t.ink2,
    signalTextColor: t.ink2,
    labelBoxBkgColor: t.paperDeep,
    labelBoxBorderColor: t.rule,
    labelTextColor: t.ink,
    loopTextColor: t.ink2,
    noteBkgColor: t.accentSoft,
    noteBorderColor: t.accent,
    noteTextColor: t.ink,
    activationBkgColor: t.accentSoft,
    activationBorderColor: t.accent,
    sequenceNumberColor: t.paper,
    // stateDiagram
    labelColor: t.ink,
    altBackground: t.paperDeep,
    transitionColor: t.ink2,
    transitionLabelColor: t.ink2,
    stateBkg: t.paperCard,
    stateBorder: t.ink3,
    stateLabelColor: t.ink,
    compositeBackground: t.paper,
    compositeBorder: t.rule,
    compositeTitleBackground: t.paperDeep,
    innerEndBackground: t.ink,
    specialStateColor: t.ink,
    // type
    fontFamily: t.body,
    fontSize: "14px",
  };
}

/** Tint / ink / rule per callout kind. Kept in family with the reference's chip palette. */
const CALLOUT_COLORS: Record<CalloutKind, { bg: string; ink: string; rule: string }> = {
  star: { bg: "#f9f0dc", ink: "#7a5a10", rule: "#d8b45e" },
  flag: { bg: "#f4e3dd", ink: "#8c2f1b", rule: "#c2725c" },
  warn: { bg: "#f6e7d6", ink: "#7a4a12", rule: "#dbb98a" },
  stop: { bg: "#f3dbd8", ink: "#6d1414", rule: "#c08a86" },
  parked: { bg: "#eae6da", ink: "#5c554a", rule: "#bdb5a3" },
  done: { bg: "#e7ece2", ink: "#3d5233", rule: "#a3b797" },
  zap: { bg: "#e2ebef", ink: "#1f4f63", rule: "#95b6c4" },
};

function calloutCss(): string {
  const kinds = Object.keys(CALLOUTS) as CalloutKind[];
  return kinds
    .map((kind) => {
      const { bg, ink, rule } = CALLOUT_COLORS[kind];
      return [
        `.callout-${kind}{background:${bg}; border-left-color:${rule}}`,
        `.callout-${kind} > strong:first-of-type{color:${ink}}`,
        `.badge-${kind}{background:${bg}; color:${ink}; border-color:${rule}}`,
        `.mark-${kind}{color:${ink}}`,
      ].join("\n");
    })
    .join("\n");
}

function styles(embedFonts: boolean): string {
  return `
${embedFonts ? fontFaceCss() : ""}

:root{
  --paper:${TOKENS.paper}; --paper-deep:${TOKENS.paperDeep}; --paper-card:${TOKENS.paperCard};
  --ink:${TOKENS.ink}; --ink-2:${TOKENS.ink2}; --ink-3:${TOKENS.ink3};
  --accent:${TOKENS.accent}; --accent-soft:${TOKENS.accentSoft};
  --rule:${TOKENS.rule}; --rule-soft:${TOKENS.ruleSoft};
  --display:${TOKENS.display};
  --body:${TOKENS.body};
  --mono:${TOKENS.mono};
  /* --max is sized so that body column = --max - 2×2.2rem padding - --rail - --gutter ≈ 62rem,
     the measure the type scale is set for (and the p / pre max-width). */
  --max:84rem; --rail:16rem; --gutter:2.4rem;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth; -webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font:400 16px/1.62 var(--body);
  background-image:radial-gradient(circle at 1px 1px, rgba(35,31,24,.045) 1px, transparent 0);
  background-size:26px 26px;
  text-rendering:optimizeLegibility;
}
.sheet{max-width:var(--max); margin:0 auto; padding:0 2.2rem 5rem}
a{color:var(--accent); text-decoration-color:rgba(140,47,27,.35); text-underline-offset:3px}
a:hover{text-decoration-color:var(--accent)}
::selection{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px}

/* ── banner: left = context, right = status ─────────────────────────────── */
.banner{
  background:var(--ink); color:#efe9dc; font:500 12px/1.5 var(--mono);
  letter-spacing:.06em; text-transform:uppercase; padding:.55rem 2.2rem;
  display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;
}
.banner b{color:#f2b8a4; font-weight:500}
.banner .right{text-align:right}

/* ── masthead ──────────────────────────────────────────────────────────── */
header.mast{padding:3.4rem 0 2rem; border-bottom:3px double var(--rule); position:relative; animation:rise .6s ease both}
.ghost{
  position:absolute; right:-1rem; top:-1rem; font:900 italic 16rem/1 var(--display);
  color:rgba(140,47,27,.055); pointer-events:none; user-select:none; z-index:-1; letter-spacing:-.05em;
}
.kicker{font:500 12.5px/1.4 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin:0 0 1rem}
h1{font:900 clamp(1.95rem,4vw,2.9rem)/1.07 var(--display); letter-spacing:-.015em; margin:0 0 1.1rem; text-wrap:balance}
h1 em{font-style:italic; font-weight:400; color:var(--ink-2)}
.stand{max-width:58rem; color:var(--ink-2)}
.stand > *{font-size:1.02rem; margin:0 0 .85rem}
.stand > *:last-child{margin-bottom:0}
.stand blockquote{margin:0 0 .85rem; padding:0; border:0; background:none; font-style:normal; color:var(--ink-2)}
.stand blockquote p{margin:0 0 .5rem}
.stand strong{color:var(--ink)}
.meta{margin-top:1.4rem; font:400 13px/1.6 var(--mono); color:var(--ink-3)}
.meta code{background:none; border:0; padding:0; font-size:inherit}

/* ── sticky jump nav: a right-hand rail beside the text ────────────────── */
.layout{
  display:grid; grid-template-columns:minmax(0,1fr) var(--rail);
  grid-template-areas:"body nav"; column-gap:var(--gutter); align-items:start;
}
.toc{
  --toc-mode:rail;
  grid-area:nav; position:sticky; top:1.3rem; z-index:5; align-self:start;
  display:flex; flex-direction:column; gap:1px;
  max-height:calc(100vh - 2.6rem); overflow-y:auto; overscroll-behavior:contain;
  scrollbar-width:thin; margin-top:1.9rem; padding:0 0 .3rem;
  border-left:1px solid var(--rule); font:500 11.5px/1.4 var(--mono);
}
.toc::before{
  content:"On this page"; padding:0 .75rem .5rem; font-size:10px; letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-3);
}
.toc a{color:var(--ink-2); text-decoration:none; padding:.3rem .75rem; border-radius:0 3px 3px 0}
.toc a:hover{background:var(--paper-deep); color:var(--accent)}
.toc a.hot{color:var(--accent); font-weight:600; background:var(--paper-deep); box-shadow:inset 2px 0 0 var(--accent)}
.toc a.sub{opacity:.8; font-size:10.5px; padding-left:1.6rem}
/* Too narrow for a rail → the reference's sticky top bar. Full-width block flow, so it can't
   overlap the text — but it does have to stay short: at --toc-depth 3 a long doc's bar wrapped to
   a dozen rows and buried the page it was meant to navigate. So the bar carries the top-level
   sections only, capped, and the H3s stay in the document. */
@media (max-width:64rem){
  .layout{display:block}
  .toc{
    --toc-mode:bar;
    top:0; flex-direction:row; flex-wrap:wrap; gap:.2rem;
    max-height:35vh; margin-top:1.2rem; padding:.45rem 0;
    background:color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter:blur(6px);
    border-left:0; border-bottom:1px solid var(--rule); font-size:12px; line-height:1;
  }
  .toc::before{display:none}
  .toc a{padding:.4rem .7rem; border-radius:3px; white-space:nowrap; box-shadow:none}
  .toc a.hot{box-shadow:none}
  .toc a.sub{display:none}
}
/* --nav-h is measured at load: in bar mode a long doc's nav wraps to two or three rows and a
   fixed scroll-margin parks the heading you jumped to underneath it. In rail mode the nav
   overlays nothing, so it only has to clear the paper edge. */
:is(h2,h3,h4){scroll-margin-top:var(--nav-h,4rem)}

/* ── prose ─────────────────────────────────────────────────────────────── */
main{grid-area:body; min-width:0; padding-top:.6rem}
h2{font:600 1.42rem/1.22 var(--display); letter-spacing:-.01em; margin:2.5rem 0 .9rem; position:relative}
h2 .sec-no{color:var(--accent); font-weight:900; margin-right:.45rem; font-feature-settings:"tnum"}
@media (min-width:96rem){
  h2 .sec-no{position:absolute; left:-4.6rem; top:.1rem; font-size:1.7rem; opacity:.85; margin:0}
}
h3{font:600 1.1rem/1.32 var(--display); margin:1.9rem 0 .6rem}
h4{font:600 12px/1.4 var(--mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); margin:1.7rem 0 .5rem}
p{max-width:62rem; margin:0 0 1rem}
strong{font-weight:600}
hr{border:0; border-top:3px double var(--rule); margin:2.6rem 0 1.6rem}
ul,ol{max-width:62rem; padding-left:1.4rem}
li{margin:.3rem 0}
li > ul, li > ol{margin-top:.3rem}
code{font:400 .88em/1.4 var(--mono); background:var(--paper-deep); border:1px solid var(--rule-soft); border-radius:3px; padding:.08em .32em}
pre{
  background:var(--ink); color:#efe9dc; border-radius:4px; padding:1rem 1.15rem;
  overflow-x:auto; max-width:62rem; font-size:.84rem; line-height:1.55;
  box-shadow:4px 4px 0 var(--paper-deep);
}
pre code{background:none; border:0; padding:0; color:inherit; font-size:inherit}
blockquote{
  margin:1.4rem 0; padding:1rem 1.6rem; border-left:3px solid var(--accent);
  background:var(--paper-deep); font-style:italic; color:var(--ink-2); max-width:60rem;
}
blockquote > :last-child{margin-bottom:0}
/* A "> # ⭐ …" block is this repo's highlighted-headline callout box, not a second page title — so a
   heading inside a blockquote is set as a prominent callout heading, one step above the body,
   instead of inheriting the masthead scale. */
blockquote :is(h1,h2,h3,h4,h5,h6){
  margin:0 0 .6rem; color:var(--ink); letter-spacing:-.005em; text-transform:none; text-wrap:balance;
}
blockquote h1{font:700 1.3rem/1.3 var(--display)}
blockquote h2{font:600 1.15rem/1.32 var(--display)}
blockquote :is(h3,h4,h5,h6){font:600 1rem/1.35 var(--display)}
img{max-width:100%; height:auto}

/* ── mermaid diagrams — inline SVG, rendered at build time ─────────────── */
/* Sibling to the pre block: same offset shadow and measure, inverted (a light card) because a
   diagram is read as a figure rather than as source. mermaid emits width="100%" plus an inline
   max-width of the diagram's natural size, so it shrinks with a narrow column but is never
   blown up past the size it was laid out for. */
figure.diagram{
  margin:1.7rem 0; padding:1.1rem 1rem; max-width:62rem;
  background:var(--paper-deep); border:1px solid var(--rule-soft); border-radius:4px;
  box-shadow:4px 4px 0 var(--paper-deep); text-align:center;
}
figure.diagram svg{height:auto; display:inline-block}
/* mermaid scopes its generated CSS under the svg's id, so nothing here leaks to the document —
   but it also hardcodes its own font stack, and the doc's is the one that matches the body. */
figure.diagram svg, figure.diagram svg text, figure.diagram svg span{font-family:var(--body)}

/* ── callouts: a glyph leading a paragraph or a list item ──────────────── */
.callout{
  border-left:3px solid var(--rule); padding:.75rem 1.1rem .75rem 1rem;
  margin:1.1rem 0; max-width:62rem; border-radius:0 3px 3px 0;
}
/* No negative left margin: it pulled the ol marker outside the printable area and clipped the
   numbers in the PDF. */
li.callout{margin:.55rem 0}
.callout > :last-child{margin-bottom:0}
.callout .mark{font-size:1.02em; margin-right:.1em; font-style:normal}
.callout-therefore{background:var(--paper-deep); border-left-color:var(--accent)}
${calloutCss()}

/* ── inline badges: the same glyphs mid-sentence, or in a table cell ───── */
.badge{
  display:inline-block; font-size:.9em; line-height:1; padding:.14em .3em .18em;
  border:1px solid transparent; border-radius:3px; white-space:nowrap; vertical-align:.02em;
}
.therefore{color:var(--accent); font-weight:600; font-style:normal; padding:0 .1em}
td .badge, th .badge{font-size:.85em}

/* ── tables ────────────────────────────────────────────────────────────── */
.tablewrap{overflow-x:auto; margin:1.5rem 0 1rem; border:1px solid var(--rule); background:var(--paper-card)}
table{border-collapse:collapse; width:100%; font-size:.88rem}
th{
  font:600 11.5px/1.3 var(--mono); letter-spacing:.07em; text-transform:uppercase; color:var(--ink-2);
  text-align:left; padding:.6rem .9rem; border-bottom:1.5px solid var(--ink); vertical-align:bottom;
}
td{padding:.55rem .9rem; border-bottom:1px solid var(--rule-soft); vertical-align:top}
tbody tr:nth-child(even){background:rgba(35,31,24,.024)}
tbody tr:hover{background:var(--paper-deep)}
tbody tr:last-child td{border-bottom:0}
td.num{font-feature-settings:"tnum"; white-space:nowrap; font-variant-numeric:tabular-nums}
td > strong:first-child{color:var(--ink)}
td p{margin:0}

/* ── definition-style bullet lists (glossaries, per-archetype lists) ───── */
ul.deflist{list-style:none; padding:0; margin:1.2rem 0; max-width:64rem; border-top:1px solid var(--rule-soft)}
ul.deflist > li{padding:.7rem 0 .7rem 1.6rem; margin:0; border-bottom:1px solid var(--rule-soft); position:relative}
ul.deflist > li::before{content:"→"; position:absolute; left:0; color:var(--accent); font-weight:600}
ul.deflist > li > strong:first-child, ul.deflist > li > p:first-child > strong:first-child{color:var(--ink)}
ul.deflist > li.callout{padding-left:1rem; border-bottom:0}
ul.deflist > li.callout::before{content:none}

/* ── task lists ────────────────────────────────────────────────────────── */
ul.tasklist{list-style:none; padding-left:.2rem}
ul.tasklist li.task{position:relative}
ul.tasklist input[type=checkbox]{accent-color:var(--accent); margin-right:.25rem; vertical-align:-.05em}

/* ── footnotes ─────────────────────────────────────────────────────────── */
.footnotes{margin-top:2.8rem; border-top:3px double var(--rule); padding-top:1.2rem; font-size:.88rem; color:var(--ink-2)}
.footnotes-sep{display:none}
.footnotes::before{content:"Notes & sources"; display:block; font:600 12px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--ink-3); margin-bottom:1rem}
.footnotes-list{padding-left:1.6rem; max-width:64rem}
.footnotes-list li{margin:.55rem 0}
.footnotes-list li:target{background:var(--accent-soft); border-radius:3px}
.footnote-backref{text-decoration:none; font-size:.9em; margin-left:.2em}
.footnote-ref a{font:500 .78em/1 var(--mono); text-decoration:none; padding:.1em .25em; border-radius:2px; background:var(--accent-soft); vertical-align:.4em}

footer.doc{margin-top:3.4rem; border-top:1px solid var(--rule); padding-top:1.2rem; font:400 13px/1.7 var(--mono); color:var(--ink-3)}
footer.doc a{color:var(--ink-2)}

@keyframes rise{from{opacity:0; transform:translateY(10px)}to{opacity:1; transform:none}}
@media (prefers-reduced-motion:reduce){
  *{animation:none !important; transition:none !important}
  html{scroll-behavior:auto}
}

@media (max-width:48rem){
  .sheet{padding:0 1.2rem 3rem}
  .banner{padding:.5rem 1.2rem; font-size:11px}
  .ghost{display:none}
  header.mast{padding-top:2.2rem}
  /* A phone has no room for a wrapped bar. Capping it at 26vh cost a quarter of the screen on
     every scroll position AND sliced the last visible entry through the middle, which reads as a
     rendering fault rather than as "there is more, scroll me". One nowrap row that scrolls
     sideways costs ~2rem, never clips a label, and still reaches every section. */
  .toc{flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden; max-height:none; scrollbar-width:none}
  .toc::-webkit-scrollbar{display:none}
  .toc a{flex:0 0 auto}
}

/* ── print: a sane PDF ─────────────────────────────────────────────────── */
@page{margin:14mm}
@media print{
  body{background:#fff; background-image:none; font-size:10.5pt; line-height:1.5}
  .sheet{padding:0; max-width:none}
  .banner{background:#fff; color:#000; border-bottom:1.5pt solid #000; padding:0 0 .3rem; letter-spacing:.04em}
  .banner b{color:#000}
  .toc, .ghost{display:none}
  /* The rail column has to go with the rail, or the body prints two-thirds width with a blank
     strip down the right-hand side. */
  .layout{display:block}
  header.mast{padding:0 0 1rem; animation:none}
  h1{font-size:20pt}
  h2{font-size:13.5pt; break-after:avoid; margin-top:1.4rem}
  h3{font-size:11.5pt}
  h3, h4{break-after:avoid}
  /* break-after keeps a heading with its body, but a heading long enough to WRAP could still
     split across the page boundary mid-title ("… administrative, not" / "technical"). A heading
     is never long enough for that to be worth a page of its own. */
  h1, h2, h3, h4{break-inside:avoid}
  blockquote h1{font-size:12.5pt}
  blockquote h2{font-size:11.5pt}
  blockquote :is(h3,h4,h5,h6){font-size:11pt}
  h2 .sec-no{position:static; font-size:inherit; margin-right:.4rem}
  p, li{orphans:3; widows:3}
  .callout, blockquote, pre, figure.diagram{break-inside:avoid}
  figure.diagram{background:#f3eee2; box-shadow:none; border:1px solid #d9d2c2; padding:.5rem}
  /* An SVG with a viewBox is a replaced element with an intrinsic ratio, so capping the height
     scales the width with it. Without this, a flowchart taller than the page is *sliced* by the
     page break — break-inside:avoid can only move a box that fits on a page at all. 240mm is
     just inside the 269mm text height @page's 14mm margins leave on A4, so a capped diagram
     always fits on a fresh page and gets moved to one whole. */
  figure.diagram svg{max-height:240mm}
  /* Tables paginate row-by-row with a repeating header — break-inside:avoid on the wrapper
     shunts a long table whole onto the next page and leaves half a page blank. */
  tr, .footnotes-list li{break-inside:avoid}
  thead{display:table-header-group}
  .tablewrap{overflow:visible}
  tbody tr:hover{background:transparent}
  tbody tr:nth-child(even){background:#f4f2ed}
  pre{box-shadow:none; background:#f4f2ed; color:#231f18; border:1px solid #d9d2c2}
  a{text-decoration:none}
  a[href^="http"]::after{content:" (" attr(href) ")"; font:400 8pt var(--mono); color:#5c554a; word-break:break-all}
  .footnotes a[href^="http"]::after{content:none}
  section, header.mast{animation:none}
}
`.trim();
}

/**
 * Highlights the nav entry for the section you're reading, and keeps it in view when the rail
 * itself has to scroll. Inlined — no network, no build. `--toc-mode` is the single source of
 * truth for which layout is live: the CSS media query sets it, this reads it back, so the
 * breakpoint is not duplicated here.
 */
const TOC_SCRIPT = `
(function(){
  var nav=document.querySelector('.toc'); if(!nav) return;
  var links=[].slice.call(nav.querySelectorAll('a[href^="#"]'));
  var targets=links.map(function(a){return document.getElementById(decodeURIComponent(a.hash.slice(1)))});
  var queued=false, hot=-1;
  function rail(){return getComputedStyle(nav).getPropertyValue('--toc-mode').trim()==='rail'}
  function measure(){
    document.documentElement.style.setProperty('--nav-h',(rail()?24:nav.offsetHeight+20)+'px');
  }
  function reveal(){
    var a=links[hot]; if(!a) return;
    var box=a.getBoundingClientRect(), frame=nav.getBoundingClientRect();
    if(rail()){
      if(nav.scrollHeight<=nav.clientHeight+2) return;
      if(box.top<frame.top+8) nav.scrollTop-=frame.top+8-box.top;
      else if(box.bottom>frame.bottom-8) nav.scrollTop+=box.bottom-(frame.bottom-8);
    } else {
      // On a phone the bar is a single nowrap row, so the current section scrolls off sideways
      // rather than downwards. Same logic, other axis; a no-op on the wrapped bar, which never
      // overflows horizontally.
      if(nav.scrollWidth<=nav.clientWidth+2) return;
      if(box.left<frame.left+8) nav.scrollLeft-=frame.left+8-box.left;
      else if(box.right>frame.right-8) nav.scrollLeft+=box.right-(frame.right-8);
    }
  }
  function sync(){
    queued=false;
    var best=0, edge=rail()?96:nav.offsetHeight+24;
    for(var i=0;i<targets.length;i++){
      var el=targets[i];
      if(el && el.getBoundingClientRect().top<=edge) best=i;
    }
    // The bar hides sub-entries, so highlight the nearest section that is actually on screen.
    while(best>0 && !links[best].offsetParent) best--;
    if(best===hot) return;
    links.forEach(function(a,i){a.classList.toggle('hot',i===best)});
    hot=best; reveal();
  }
  addEventListener('scroll',function(){if(!queued){queued=true;requestAnimationFrame(sync)}},{passive:true});
  addEventListener('resize',function(){measure(); sync()});
  measure(); sync();
})();
`.trim();

export type TocEntry = { level: number; slug: string; title: string; label: string };

export type PageParts = {
  title: string;
  kicker?: string;
  bannerLeft?: string;
  bannerRight?: string;
  /** Big watermark glyph behind the masthead, as the reference does with its "X". */
  ghost?: string;
  standfirst: string;
  meta: string;
  toc: TocEntry[];
  body: string;
  footer: string;
  embedFonts: boolean;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wraps a rendered body in the shell. `standfirst`, `body`, `meta` and `footer` are HTML. */
export function page(parts: PageParts): string {
  const banner =
    parts.bannerLeft || parts.bannerRight
      ? `<div class="banner">
  <span class="left">${parts.bannerLeft ?? ""}</span>
  <span class="right"><b>${parts.bannerRight ?? ""}</b></span>
</div>`
      : "";

  const toc =
    parts.toc.length > 1
      ? `<nav class="toc" aria-label="Jump to section">
${parts.toc
  .map(
    (entry) =>
      `  <a href="#${entry.slug}"${entry.level > 2 ? ' class="sub"' : ""}>${escapeHtml(entry.label)}</a>`,
  )
  .join("\n")}
</nav>`
      : "";

  const main = `<main>\n${parts.body}\n</main>`;
  // The rail lives in a two-column grid with the body. No nav → no column to reserve, so the
  // body keeps the full sheet width rather than printing against an empty strip.
  const content = toc ? `<div class="layout">\n${toc}\n\n${main}\n</div>` : main;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(parts.title)}</title>
<style>
${styles(parts.embedFonts)}
</style>
</head>
<body>
${banner}
<div class="sheet">

<header class="mast">
${parts.ghost ? `  <span class="ghost" aria-hidden="true">${escapeHtml(parts.ghost)}</span>\n` : ""}${
    parts.kicker ? `  <p class="kicker">${parts.kicker}</p>\n` : ""
  }  <h1>${parts.title}</h1>
${parts.standfirst ? `  <div class="stand">\n${parts.standfirst}\n  </div>\n` : ""}  <p class="meta">${parts.meta}</p>
</header>

${content}

<footer class="doc">${parts.footer}</footer>

</div>
<script>${TOC_SCRIPT}</script>
</body>
</html>
`;
}
