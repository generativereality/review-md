/**
 * What raw HTML a document may carry into its render.
 *
 * A rendered doc is opened in a browser — often one that is signed in to work systems — so a
 * markdown file is not trusted just because it sits in a repo: it may be a pasted transcript, a
 * contributor's draft, or a page an agent fetched and saved. Formatting HTML (`<br>` in a table
 * cell, a `<span class>`, `<details>`) is what real docs use; anything that can run code, load a
 * resource or navigate the page is not. A tag outside the policy is shown as text, so the author
 * sees exactly what was dropped instead of getting a silently different document.
 *
 * `--allow-html` turns the filter off for a doc you wrote yourself. The page's Content Security
 * Policy (see `contentSecurityPolicy`) still applies either way.
 */

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "align",
  "alt",
  "aria-hidden",
  "aria-label",
  "cite",
  "class",
  "colspan",
  "datetime",
  "dir",
  "height",
  "href",
  "id",
  "lang",
  "media",
  "name",
  "open",
  "role",
  "rowspan",
  "scope",
  "src",
  "srcset",
  "start",
  "style",
  "title",
  "type",
  "valign",
  "width",
]);

const URL_ATTRIBUTES = new Set(["href", "src", "srcset", "cite"]);

const TAG = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

/** `javascript:`, `vbscript:` and non-image `data:` URLs can run code or smuggle a document. */
function isSafeUrl(raw: string, attribute: string): boolean {
  // Browsers ignore ASCII whitespace and control characters inside a scheme, so
  // `java\tscript:` is still `javascript:`.
  // eslint-disable-next-line no-control-regex
  const value = decodeEntities(raw).replace(/[\u0000- ]/g, "").toLowerCase();
  const candidates = attribute === "srcset" ? value.split(",") : [value];
  return candidates.every((candidate) => {
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(candidate)?.[1];
    if (!scheme) return true;
    if (scheme === "data") return /^data:image\/(png|gif|jpe?g|webp|avif)[;,]/.test(candidate);
    return ["http", "https", "mailto", "tel", "file"].includes(scheme);
  });
}

function isAllowedTag(name: string, attributes: string): boolean {
  if (!ALLOWED_TAGS.has(name.toLowerCase())) return false;
  for (const match of attributes.matchAll(ATTRIBUTE)) {
    const attribute = match[1].toLowerCase();
    if (!ALLOWED_ATTRIBUTES.has(attribute) && !attribute.startsWith("data-")) return false;
    const value = (match[2] ?? "").replace(/^["']|["']$/g, "");
    if (URL_ATTRIBUTES.has(attribute) && !isSafeUrl(value, attribute)) return false;
    // `style` cannot run script in a current browser, but `url(` in it can fetch — and the
    // page's CSP is the backstop for that, not this filter. `expression(` is old-IE script.
    if (attribute === "style" && /expression\s*\(|javascript:/i.test(decodeEntities(value)))
      return false;
  }
  return true;
}

/**
 * The tags in a raw HTML fragment that the policy refuses, in order. Empty means the fragment is
 * allowed as written. A comment is allowed only when its body holds no `<` or `>`. Anything that
 * is not a well-formed tag or a comment — a bare `<?php`, a
 * `<![CDATA[`, a tag cut off mid-attribute — counts as refused, because a browser's parser is far
 * more forgiving than this one and would find a tag in it.
 */
export function refusedTags(fragment: string): string[] {
  const refused: string[] = [];
  let rest = fragment;
  for (const match of fragment.matchAll(TAG)) {
    rest = rest.replace(match[0], "");
    if (match[0].startsWith("<!--")) {
      // A browser ends a comment at `<!-->`, `<!--->` or `--!>` as well as `-->`, so a comment
      // this regex reads as one can be, to a browser, a comment and then a live tag. Each of
      // those early ends needs a `>` inside what we took for the body, so a body with no `<` or
      // `>` ends where the browser ends it. Anything else is refused.
      if (/[<>]/.test(match[0].slice(4, -3))) refused.push(match[0]);
      continue;
    }
    if (!isAllowedTag(match[1], match[2] ?? "")) refused.push(match[0]);
  }
  const leftover = /<[!?/A-Za-z][^\n]{0,40}/.exec(rest);
  if (leftover) refused.push(leftover[0]);
  return refused;
}

/** The script every page carries (the jump-nav highlighter), pinned by hash in the CSP. */
export function scriptHash(script: string): string {
  return `'sha256-${base64(sha256(new TextEncoder().encode(script)))}'`;
}

// SHA-256 in plain JS, not `node:crypto`: the browser build assembles pages too, and the
// browser's own digest is async. Checked against node:crypto in the tests.
const K = Uint32Array.from(
  "428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da 983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2"
    .split(" "),
  (h) => parseInt(h, 16),
);

function sha256(data: Uint8Array): Uint8Array {
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = new Uint8Array(((data.length + 72) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000));
  view.setUint32(padded.length - 4, data.length << 3);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) >>> 0));
  }
  const out = new Uint8Array(32);
  h.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
  return out;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * The policy every standalone render ships with. A render is self-contained by design — inline
 * styles, data: fonts, inline SVG diagrams — so it needs to load nothing, and the policy says so:
 * no script but the page's own, no frames, no forms, no fetches, no `<base>` rewrite. Images are
 * the one thing a doc legitimately links out to.
 */
export function contentSecurityPolicy(pageScript: string): string {
  return [
    "default-src 'none'",
    `script-src ${scriptHash(pageScript)}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "img-src data: https: http: file:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}
