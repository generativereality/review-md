/**
 * Pack manifests. A "pack" is the normal unit — a planning pack is routinely a dozen docs — so
 * re-rendering after edits has to be one command, with the per-doc kicker and banner recorded
 * rather than retyped.
 *
 * Docs in the same pack cross-link to each other's `.html` (see `rewriteHref`), and the pack
 * gets an `index.html` cover so a folder of renders is presentable on its own.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export type DocEntry = {
  /** Path to the source markdown, relative to the repo root (or the cwd, outside a repo). */
  src: string;
  /** Output filename inside the pack directory. Defaults to the source basename + `.html`. */
  out?: string;
  kicker?: string;
  bannerLeft?: string;
  bannerRight?: string;
  ghost?: string;
  /** Short line shown on the pack index instead of the doc's own standfirst. */
  blurb?: string;
};

export type Manifest = {
  /** Pack name, shown on the index page. */
  name: string;
  /** Output directory, relative to the repo root (or the cwd). Defaults to `rendered-docs/<manifest basename>`. */
  outDir?: string;
  /** Applied to every doc unless the doc overrides it. */
  defaults?: Omit<DocEntry, "src" | "out" | "blurb">;
  docs: DocEntry[];
};

export function loadManifest(manifestPath: string): Manifest {
  const raw: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${manifestPath}: manifest must be a JSON object`);
  }
  const manifest = raw as Partial<Manifest>;
  if (!Array.isArray(manifest.docs) || manifest.docs.length === 0) {
    throw new Error(`${manifestPath}: manifest needs a non-empty "docs" array`);
  }
  for (const doc of manifest.docs) {
    if (typeof doc?.src !== "string") throw new Error(`${manifestPath}: every doc needs a "src"`);
  }
  return {
    name: manifest.name ?? path.basename(manifestPath, ".json"),
    outDir: manifest.outDir ?? `rendered-docs/${path.basename(manifestPath, ".json")}`,
    defaults: manifest.defaults ?? {},
    docs: manifest.docs,
  };
}

export function outputNameFor(doc: DocEntry): string {
  return doc.out ?? `${path.basename(doc.src, path.extname(doc.src))}.html`;
}

export type IndexItem = { href: string; title: string; blurb: string };

/**
 * The pack cover. Same shell as the docs so it doesn't read like a directory listing; built by
 * the CLI from each doc's rendered title.
 */
export function packIndexMarkdown(manifest: Manifest, items: IndexItem[]): string {
  const rows = items
    .map((item) => `- **[${item.title}](${item.href})** — ${item.blurb || "no summary"}`)
    .join("\n");
  return `# ${manifest.name}\n\n${items.length} documents in this pack. Every link below is a self-contained file in this folder.\n\n${rows}\n`;
}
