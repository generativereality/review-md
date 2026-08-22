/**
 * Self-contained font embedding.
 *
 * The whole point of a rendered doc is that it opens from a `file://` URL on a laptop with
 * no network — so a Google Fonts <link> is not an option here. We base64-inline latin-ext woff2
 * subsets instead: ~165 KB of font, ~225 KB once base64'd. Latin-ext covers the accented and
 * Nordic characters names need (Rådén, Söderberg, Lemaître); emoji glyphs come from the OS
 * emoji font.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

type FontFace = {
  family: string;
  /** A range for the variable Fraunces axis, a single value for the static Plex cuts. */
  weight: string;
  style: "normal" | "italic";
  spec: string;
};

const FACES: readonly FontFace[] = [
  {
    family: "Fraunces",
    weight: "100 900",
    style: "normal",
    spec: "@fontsource-variable/fraunces/files/fraunces-latin-ext-wght-normal.woff2",
  },
  {
    family: "Fraunces",
    weight: "100 900",
    style: "italic",
    spec: "@fontsource-variable/fraunces/files/fraunces-latin-ext-wght-italic.woff2",
  },
  {
    family: "IBM Plex Sans",
    weight: "400",
    style: "normal",
    spec: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-normal.woff2",
  },
  {
    family: "IBM Plex Sans",
    weight: "400",
    style: "italic",
    spec: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-italic.woff2",
  },
  {
    family: "IBM Plex Sans",
    weight: "500",
    style: "normal",
    spec: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-500-normal.woff2",
  },
  {
    family: "IBM Plex Sans",
    weight: "600",
    style: "normal",
    spec: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff2",
  },
  {
    family: "IBM Plex Mono",
    weight: "400",
    style: "normal",
    spec: "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2",
  },
  {
    family: "IBM Plex Mono",
    weight: "500",
    style: "normal",
    spec: "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2",
  },
];

let cached: string | null = null;

/**
 * `@font-face` rules with the woff2 payloads inlined as data URIs. Returns an empty string
 * (and warns once) when the @fontsource packages aren't installed — the CSS font stacks all
 * name a system fallback, so the render degrades rather than failing.
 */
export function fontFaceCss(): string {
  if (cached !== null) return cached;

  const rules: string[] = [];
  for (const face of FACES) {
    let data: Buffer;
    try {
      data = readFileSync(require_.resolve(face.spec));
    } catch {
      console.warn(
        `⚠ render-doc: font ${face.spec} not resolvable — falling back to system fonts. Reinstall render-doc, or pass --no-fonts to skip embedding.`,
      );
      cached = "";
      return cached;
    }
    rules.push(
      [
        "@font-face{",
        `font-family:"${face.family}";`,
        `font-style:${face.style};`,
        `font-weight:${face.weight};`,
        "font-display:block;",
        `src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2");`,
        "}",
      ].join(""),
    );
  }

  cached = rules.join("\n");
  return cached;
}
