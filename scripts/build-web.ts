/**
 * Builds `dist/review-md.web.js`, the browser build (`src/web.ts`): one minified IIFE with the
 * renderer, mermaid and the fonts inside it. Run with tsx (`npm run build`), because the fonts
 * are read here, through `fonts.ts`, and handed to the bundle as a string.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

import { fontFaceCss } from "../src/fonts.ts";

const css = fontFaceCss();
if (!css) throw new Error("build-web: the fonts did not resolve, so the browser build would ship without them");
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;

await build({
  entryPoints: ["src/web.ts"],
  outfile: "dist/review-md.web.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["safari16", "chrome110"],
  minify: true,
  legalComments: "eof",
  define: { __REVIEW_MD_VERSION__: JSON.stringify(version) },
  plugins: [
    {
      name: "review-md-web",
      setup(b) {
        // The fonts, already read: no `node:fs` in the page.
        b.onResolve({ filter: /\/fonts\.ts$/ }, (a) => ({ path: a.path, namespace: "fonts" }));
        b.onLoad({ filter: /.*/, namespace: "fonts" }, () => ({
          contents: `export function fontFaceCss(){return ${JSON.stringify(css)}}`,
          loader: "js",
        }));
        // `render.ts` reaches `node:path` only for a repo or pack link, which the browser build
        // never has (`rewriteHref` returns first); a call that did would be a bug, so it throws.
        b.onResolve({ filter: /^node:path$/ }, () => ({ path: "path", namespace: "nopath" }));
        b.onLoad({ filter: /.*/, namespace: "nopath" }, () => ({
          contents: `const no=()=>{throw new Error("review-md web: node:path is not available here")};export default {resolve:no,dirname:no,relative:no,isAbsolute:no,sep:"/"};`,
          loader: "js",
        }));
      },
    },
  ],
});
console.log(`✓ dist/review-md.web.js (review-md ${version})`);
