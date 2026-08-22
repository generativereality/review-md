#!/usr/bin/env node
/**
 * review-md — markdown → a single self-contained styled HTML file.
 *
 *   review-md docs/PLAN.md
 *   review-md docs/PLAN.md --banner-left "Planning · Fri 2026-08-07"
 *   review-md --manifest packs/planning.json
 *
 * Output is CSS-inlined and font-inlined: it opens from a `file://` URL, offline, on someone
 * else's laptop, with no build step. See `skills/review-md/SKILL.md` for the design contract.
 *
 * This exists because the throwaway version of it lived in a session scratchpad, the scratchpad
 * got wiped, and 25 rendered files went with it. The markdown was safe in git; the tool was not.
 * A renderer you can depend on is worth more than one you can retype.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import updateNotifier from "update-notifier";
import PKG from "../package.json" with { type: "json" };
import path from "node:path";
import { parseArgs } from "node:util";

import { checkFootnotes, reportFootnoteProblems } from "./footnotes.ts";
import { displayPath, gitRoot, repoUrlFor, rootOwning, sourceRevision } from "./git.ts";
import { loadManifest, outputNameFor, packIndexMarkdown, type DocEntry } from "./manifest.ts";
import {
  describeDiagramProblem,
  mermaidSources,
  renderDiagramBatch,
  type Diagram,
} from "./mermaid.ts";
import { renderMarkdown } from "./render.ts";
import { page } from "./theme.ts";

const DEFAULT_OUT_DIR = "rendered-docs";

const USAGE = `
review-md — markdown → one self-contained styled HTML file

  review-md <src.md> [dst.html] [options]
  review-md --manifest <pack.json> [options]

Options
  --kicker <text>          eyebrow line above the title
  --banner-left <text>     dark banner, left side — context ("Planning · Fri 2026-08-07")
  --banner-right <text>    dark banner, right side — status ("updated after the review")
  --ghost <text>           watermark glyph behind the masthead
  --title <text>           override the title (default: the doc's first H1)
  --out-dir <dir>          default: ${DEFAULT_OUT_DIR}
  --toc-depth <2|3>        deepest heading in the jump nav (default 2)
  --date <YYYY-MM-DD>      render date shown in the masthead meta line
  --repo-url <url>         base URL for in-repo .md links and the provenance footer
                           (default: derived from \`git remote get-url origin\`)
  --no-fonts               don't inline the woff2 subsets (~225 KB smaller, needs local fonts)
  --no-diagrams            leave \`\`\`mermaid fences as code blocks (skips the headless browser)
  --no-section-numbers     don't prefix H2s with §1, §2, …
  --artifact               emit body-level HTML for publishing as a Claude Artifact
                           (no doctype/<html>/<head>/<body> — the host supplies those)
  --strict                 exit 1 if the footnote integrity check finds anything
  --quiet                  only print warnings
`.trim();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The source citation in the footer: a link to the file on the forge when we know where the repo
 * lives, plain code otherwise. `main` is assumed as the branch — a rendered doc is a snapshot
 * handed to someone, and a link to the branch tip is the one that keeps working.
 */
function sourceLink(repoUrl: string | null, repoRelative: string): string {
  const label = `<code>${escapeHtml(repoRelative)}</code>`;
  if (!repoUrl) return label;
  return `<a href="${escapeHtml(`${repoUrl}/blob/main/${repoRelative}`)}">${label}</a>`;
}

const BLURB_MAX = 200;

/** The standfirst, stripped to text and cut at a sentence (else a word) boundary, for the index. */
function summarise(standfirstHtml: string): string {
  const text = standfirstHtml
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= BLURB_MAX) return text;

  const window = text.slice(0, BLURB_MAX);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "));
  if (sentenceEnd > BLURB_MAX * 0.4) return window.slice(0, sentenceEnd + 1);

  const wordEnd = window.lastIndexOf(" ");
  return `${(wordEnd > 0 ? window.slice(0, wordEnd) : window).replace(/[,;:—-]$/, "").trimEnd()}…`;
}

/**
 * Prints any diagram mermaid refused, and returns whether there were any. Same contract as the
 * footnote check: a warning by default, a failure under `--strict`. It has to be loud — a fence
 * that doesn't render falls back to showing its source, which is precisely the silent degradation
 * this feature exists to end.
 */
function reportDiagramProblems(sourcePath: string, diagrams: readonly Diagram[]): boolean {
  const failures = diagrams
    .map((diagram, index) =>
      "error" in diagram ? describeDiagramProblem(index, diagram.error) : null,
    )
    .filter((line): line is string => line !== null);
  if (failures.length === 0) return false;
  const where = path.relative(process.cwd(), sourcePath) || sourcePath;
  console.warn(`⚠ mermaid   ${where} — ${failures.length} diagram(s) did not render:`);
  for (const line of failures) console.warn(line);
  return true;
}

type GlobalOptions = {
  outDir: string;
  /** Explicit `--repo-url`. When null it is derived per doc from that doc's own repo. */
  repoUrl: string | null;
  date: string;
  embedFonts: boolean;
  renderDiagrams: boolean;
  sectionNumbers: boolean;
  tocDepth: 2 | 3;
  /** Emit body-level HTML for a Claude Artifact rather than a standalone document. */
  artifact: boolean;
  strict: boolean;
  quiet: boolean;
};

type RenderJob = DocEntry & {
  /** Absolute source path. */
  absSrc: string;
  /** Absolute output path. */
  absOut: string;
};

function renderOne(
  job: RenderJob,
  globals: GlobalOptions,
  context: {
    root: string;
    /** The source text — read up front, because the diagrams in it are rendered in one batch. */
    markdown: string;
    /** SVG for this doc's mermaid fences, in document order. */
    diagrams?: readonly Diagram[];
    packLinks?: Map<string, string>;
    titleOverride?: string;
    /** The pack cover: generated markdown, no source file to check or to cite. */
    synthesised?: boolean;
    /** Replaces the provenance line and footer for synthesised documents. */
    provenance?: { meta: string; footer: string };
  },
): { title: string; blurb: string; hadProblems: boolean } {
  const markdown = context.markdown;
  // Both reports run — `||` would short-circuit the diagram warnings away on any doc that also
  // has a footnote problem, which is exactly the doc you want both halves of.
  const footnoteProblems = context.synthesised
    ? false
    : reportFootnoteProblems(job.absSrc, checkFootnotes(markdown));
  const diagramProblems = context.synthesised
    ? false
    : reportDiagramProblems(job.absSrc, context.diagrams ?? []);
  const hadProblems = footnoteProblems || diagramProblems;

  // The root that owns the *source*, not the invocation cwd — see `rootOwning`.
  const root = rootOwning(job.absSrc, context.root);
  // `--repo-url` wins; otherwise the source's own origin remote; otherwise nothing, and in-repo
  // `.md` links are left exactly as authored rather than pointed at somebody else's GitHub.
  const repoUrl = globals.repoUrl ?? repoUrlFor(gitRoot(path.dirname(job.absSrc)));

  const rendered = renderMarkdown(markdown, {
    sourcePath: job.absSrc,
    repoRoot: root,
    repoUrl,
    packLinks: context.packLinks,
    sectionNumbers: globals.sectionNumbers,
    tocDepth: globals.tocDepth,
    diagrams: context.diagrams,
  });

  const repoRelative = displayPath(root, job.absSrc);
  const title =
    context.titleOverride ??
    (rendered.title || path.basename(job.absSrc, path.extname(job.absSrc)));
  const titleText = context.titleOverride ?? rendered.titleText ?? title;
  const revision = sourceRevision(job.absSrc);

  const metaParts = [
    `source: <code>${escapeHtml(repoRelative)}</code>`,
    revision ? `revision ${escapeHtml(revision)}` : null,
    `rendered ${escapeHtml(globals.date)}`,
  ].filter(Boolean);

  const html = page({
    title,
    kicker: job.kicker ? escapeHtml(job.kicker) : undefined,
    bannerLeft: job.bannerLeft ? escapeHtml(job.bannerLeft) : undefined,
    bannerRight: job.bannerRight ? escapeHtml(job.bannerRight) : undefined,
    ghost: job.ghost,
    standfirst: rendered.standfirst,
    meta: context.provenance?.meta ?? metaParts.join(" · "),
    toc: rendered.toc,
    body: rendered.body,
    footer:
      context.provenance?.footer ??
      `Rendered from ${sourceLink(repoUrl, repoRelative)} with <code>review-md</code>. The markdown is the source of truth — edit it there and re-render; don't hand-edit this file.`,
    embedFonts: globals.embedFonts,
    artifact: globals.artifact,
  });

  mkdirSync(path.dirname(job.absOut), { recursive: true });
  writeFileSync(job.absOut, html);

  if (!globals.quiet) {
    const size = `${Math.round(html.length / 1024)} KB`;
    console.log(`✓ ${path.relative(process.cwd(), job.absOut)}  (${size})`);
  }

  return { title: titleText, blurb: summarise(rendered.standfirst), hadProblems };
}

/**
 * Reads every job's markdown and renders all their mermaid fences in **one** browser launch.
 *
 * A pre-pass, because markdown-it's renderer is synchronous and rendering a diagram is not —
 * and because launching Chromium once for a 12-doc pack rather than twelve times is the
 * difference between a second of fixed cost and twelve.
 */
async function prepare(
  jobs: readonly RenderJob[],
  globals: GlobalOptions,
): Promise<{ markdown: string; diagrams: Diagram[] }[]> {
  const markdowns = jobs.map((job) => readFileSync(job.absSrc, "utf8"));
  if (!globals.renderDiagrams) {
    return markdowns.map((markdown) => ({ markdown, diagrams: [] }));
  }

  const sources = markdowns.map(mermaidSources);
  const total = sources.reduce((count, list) => count + list.length, 0);
  if (total > 0 && !globals.quiet) {
    console.log(`Rendering ${total} mermaid diagram(s) to inline SVG…`);
  }

  const rendered = await renderDiagramBatch(sources);
  return markdowns.map((markdown, index) => ({ markdown, diagrams: rendered[index] }));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      manifest: { type: "string" },
      kicker: { type: "string" },
      "banner-left": { type: "string" },
      "banner-right": { type: "string" },
      ghost: { type: "string" },
      title: { type: "string" },
      "out-dir": { type: "string" },
      "toc-depth": { type: "string" },
      date: { type: "string" },
      "repo-url": { type: "string" },
      "no-fonts": { type: "boolean" },
      "no-diagrams": { type: "boolean" },
      "no-section-numbers": { type: "boolean" },
      artifact: { type: "boolean" },
      strict: { type: "boolean" },
      quiet: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || (!values.manifest && positionals.length === 0)) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const tocDepth = values["toc-depth"] === "3" ? 3 : 2;
  const globals: GlobalOptions = {
    outDir: values["out-dir"] ?? DEFAULT_OUT_DIR,
    repoUrl: values["repo-url"] ?? null,
    date: values.date ?? new Date().toISOString().slice(0, 10),
    embedFonts: values["no-fonts"] !== true,
    renderDiagrams: values["no-diagrams"] !== true,
    sectionNumbers: values["no-section-numbers"] !== true,
    tocDepth,
    artifact: values.artifact === true,
    strict: values.strict === true,
    quiet: values.quiet === true,
  };

  // Outside a git repo the cwd stands in for the root: paths stay readable, the revision line
  // drops out, and nothing throws. Rendering a loose markdown file is a supported use.
  const root = gitRoot(process.cwd()) ?? process.cwd();
  let problems = false;

  if (values.manifest) {
    const manifestPath = path.resolve(values.manifest);
    const manifest = loadManifest(manifestPath);
    const outDir = path.resolve(root, values["out-dir"] ?? manifest.outDir ?? DEFAULT_OUT_DIR);

    const jobs: RenderJob[] = manifest.docs.map((doc) => ({
      ...manifest.defaults,
      ...doc,
      absSrc: path.resolve(root, doc.src),
      absOut: path.join(outDir, outputNameFor(doc)),
    }));

    // Every doc knows about every sibling, so intra-pack `.md` links become local `.html`.
    const packLinks = new Map(jobs.map((job) => [job.absSrc, path.basename(job.absOut)]));

    if (!globals.quiet)
      console.log(`Rendering pack "${manifest.name}" → ${path.relative(process.cwd(), outDir)}`);

    const prepared = await prepare(jobs, globals);

    const items = jobs.map((job, index) => {
      const result = renderOne(job, globals, {
        root,
        packLinks,
        markdown: prepared[index].markdown,
        diagrams: prepared[index].diagrams,
      });
      problems = problems || result.hadProblems;
      return {
        href: path.basename(job.absOut),
        title: result.title,
        blurb: job.blurb ?? result.blurb,
      };
    });

    // The cover page — synthesised markdown, never written to disk. Its notional source sits in
    // the output dir so the `.html` links it contains are already pack-local.
    renderOne(
      {
        src: displayPath(root, manifestPath),
        absSrc: path.join(outDir, "index.md"),
        absOut: path.join(outDir, "index.html"),
        kicker: manifest.defaults?.kicker,
        bannerLeft: manifest.defaults?.bannerLeft,
        bannerRight: manifest.defaults?.bannerRight,
      },
      { ...globals, sectionNumbers: false },
      {
        root,
        markdown: packIndexMarkdown(manifest, items),
        synthesised: true,
        provenance: {
          meta: `pack manifest: <code>${escapeHtml(displayPath(root, manifestPath))}</code> · rendered ${escapeHtml(globals.date)}`,
          footer: `Pack cover generated by <code>review-md --manifest ${escapeHtml(displayPath(root, manifestPath))}</code>. Re-run it after editing any source doc.`,
        },
      },
    );
  } else {
    const src = path.resolve(positionals[0]);
    const out = positionals[1]
      ? path.resolve(positionals[1])
      : path.resolve(root, globals.outDir, `${path.basename(src, path.extname(src))}.html`);

    const job: RenderJob = {
      src: displayPath(root, src),
      absSrc: src,
      absOut: out,
      kicker: values.kicker,
      bannerLeft: values["banner-left"],
      bannerRight: values["banner-right"],
      ghost: values.ghost,
    };
    const [prepared] = await prepare([job], globals);

    const result = renderOne(job, globals, {
      root,
      titleOverride: values.title,
      markdown: prepared.markdown,
      diagrams: prepared.diagrams,
    });
    problems = result.hadProblems;
  }

  if (problems && globals.strict) {
    console.error("✗ integrity problems above (footnotes / diagrams), and --strict was set");
    process.exit(1);
  }
}

// An unhandled rejection exits 0 on some Node versions, and a renderer that reports success
// having written nothing is worse than one that crashes.
// Non-blocking daily update check, plus our own one-line warning.
//
// `notifier.notify()` prints its boxed banner only on a TTY, and the caller here usually is not
// one: an agent shells out, captures stdout, and would otherwise never learn it is driving an old
// build — it just gets the old behaviour and concludes the tool cannot do the thing. That failure
// is invisible from inside the session, so the plain line matters more than the pretty box.
//
// Same shape and prefix as cctabs on purpose: the same agents drive both, and a warning they
// already recognise costs nothing to read.
const notifier = updateNotifier({ pkg: { name: PKG.name, version: PKG.version } });
notifier.notify();
if (notifier.update && notifier.update.latest !== notifier.update.current) {
  const { current, latest } = notifier.update;
  process.stdout.write(
    `[review-md] OUTDATED ${current} < ${latest} — run: npm install -g ${PKG.name}@latest\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `✗ ${error.message}` : error);
  process.exitCode = 1;
});
