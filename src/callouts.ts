/**
 * The callout convention.
 *
 * A document leads a sentence with a glyph — `⭐ 🚩 ⚠️ ⛔ ⏸ ✅ ⚡` — and uses `⇒` for
 * "therefore". That convention carries most of the emphasis in a working document; a plain
 * markdown renderer leaves it as a bare emoji in running prose and the doc reads flat.
 *
 * Two positions, two treatments:
 *
 *   - **Leading** a paragraph or a list item → the whole block becomes a styled callout
 *     (tinted panel, accent rule, glyph as the mark).
 *   - **Mid-sentence**, or anywhere inside a table cell or heading → an inline badge, so the
 *     sentence keeps flowing. Table cells never become panels; a bordered panel inside a
 *     `<td>` wrecks a table, and these docs badge inside cells constantly.
 *
 * `⇒` is a connective, not a severity: leading a block it makes a "therefore" callout, and if
 * a severity glyph follows it (`⇒ ⚠️ **On incremental cash the order inverts.**`) the severity
 * wins the colour and both glyphs render.
 *
 * The glyph set is the tool's own convention, and the theme is built around it — same eight
 * marks, same meanings, every document. Nothing here reads a config file: a convention that
 * varies per repo stops being one.
 */

import Token from "markdown-it/lib/token.mjs";

export type CalloutKind = "star" | "flag" | "warn" | "stop" | "parked" | "done" | "zap";

type CalloutSpec = {
  glyph: string;
  /** Accessible name — the glyph itself is decorative-ish, but it carries real meaning. */
  label: string;
  /** What the glyph means. Mirrored in the skill's design contract. */
  meaning: string;
};

export const CALLOUTS: Readonly<Record<CalloutKind, CalloutSpec>> = {
  star: { glyph: "⭐", label: "Key point", meaning: "the headline finding — read this one" },
  flag: { glyph: "🚩", label: "Flag", meaning: "a structural problem someone must answer" },
  warn: { glyph: "⚠️", label: "Caveat", meaning: "a qualification on the claim next to it" },
  stop: {
    glyph: "⛔",
    label: "Stop",
    meaning: "disproven, prohibited, or dead — do not build on it",
  },
  parked: { glyph: "⏸", label: "Gated", meaning: "blocked on a decision or a permission" },
  done: { glyph: "✅", label: "Done", meaning: "settled, delivered, or already approved" },
  zap: { glyph: "⚡", label: "Live", meaning: "in flight right now" },
};

export const THEREFORE_GLYPH = "⇒";
const THEREFORE_LABEL = "therefore";

/** U+FE0F. Authors are inconsistent about the variation selector; match with or without. */
const VS16 = "️";

function glyphPattern(glyph: string): string {
  const bare = glyph.endsWith(VS16) ? glyph.slice(0, -VS16.length) : glyph;
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `${escaped}${VS16}?`;
}

const KIND_BY_BARE_GLYPH = new Map<string, CalloutKind>(
  (Object.entries(CALLOUTS) as [CalloutKind, CalloutSpec][]).map(([kind, spec]) => [
    spec.glyph.replace(VS16, ""),
    kind,
  ]),
);

const ALL_GLYPHS = [...Object.values(CALLOUTS).map((spec) => spec.glyph), THEREFORE_GLYPH] as const;

const ANY_GLYPH_SOURCE = ALL_GLYPHS.map(glyphPattern).join("|");
/** Global, for splitting running text. Rebuilt per use — a shared /g regex carries state. */
const anyGlyph = (): RegExp => new RegExp(`(${ANY_GLYPH_SOURCE})`, "u");
const leadingGlyph = new RegExp(`^[ \\t]*(${ANY_GLYPH_SOURCE})`, "u");

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function kindOf(glyph: string): CalloutKind | "therefore" {
  const bare = glyph.replace(VS16, "");
  return bare === THEREFORE_GLYPH ? "therefore" : (KIND_BY_BARE_GLYPH.get(bare) ?? "warn");
}

function markHtml(
  glyph: string,
  kind: CalloutKind | "therefore",
  variant: "mark" | "badge",
): string {
  if (kind === "therefore") {
    return `<span class="therefore" role="img" aria-label="${THEREFORE_LABEL}">${escapeHtml(glyph)}</span>`;
  }
  const { label } = CALLOUTS[kind];
  return `<span class="${variant} ${variant}-${kind}" role="img" aria-label="${label}">${escapeHtml(glyph)}</span>`;
}

function htmlToken(content: string): Token {
  const token = new Token("html_inline", "", 0);
  token.content = content;
  return token;
}

function textToken(content: string): Token {
  const token = new Token("text", "", 0);
  token.content = content;
  return token;
}

function addClass(token: Token, className: string): void {
  const existing = token.attrGet("class");
  token.attrSet("class", existing ? `${existing} ${className}` : className);
}

/**
 * Strip the leading glyph run off a block's first text token and return the callout class it
 * implies. `null` when the block doesn't open with a glyph.
 */
function takeLeadingGlyphs(
  inline: Token,
): { kind: CalloutKind | "therefore"; marks: string } | null {
  const first = inline.children?.[0];
  if (!first || first.type !== "text") return null;

  let rest = first.content;
  const glyphs: string[] = [];
  for (;;) {
    const match = leadingGlyph.exec(rest);
    if (!match) break;
    glyphs.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  if (glyphs.length === 0) return null;

  const kinds = glyphs.map(kindOf);
  const severity = kinds.find((kind): kind is CalloutKind => kind !== "therefore");
  const kind = severity ?? "therefore";

  first.content = rest.replace(/^[ \t]+/, "");
  return { kind, marks: glyphs.map((glyph, i) => markHtml(glyph, kinds[i], "mark")).join(" ") };
}

/** Rewrite every remaining glyph inside a token's children into an inline badge. */
function badgeInlineGlyphs(inline: Token): void {
  const children = inline.children;
  if (!children) return;

  const out: Token[] = [];
  let changed = false;
  for (const child of children) {
    if (child.type !== "text" || !anyGlyph().test(child.content)) {
      out.push(child);
      continue;
    }
    changed = true;
    // String.split with a capturing group interleaves separators with the text between them,
    // so odd indices are exactly the matched glyphs.
    const pieces = child.content.split(anyGlyph());
    pieces.forEach((piece, index) => {
      if (piece === "") return;
      out.push(
        index % 2 === 1 ? htmlToken(markHtml(piece, kindOf(piece), "badge")) : textToken(piece),
      );
    });
  }
  if (changed) inline.children = out;
}

const TASK_MARKER = /^\[([ xX])\][ \t]+/;

/** `- [ ] foo` / `- [x] foo` → a real (disabled) checkbox. GFM task lists. */
function takeTaskMarker(inline: Token): boolean | null {
  const first = inline.children?.[0];
  if (!first || first.type !== "text") return null;
  const match = TASK_MARKER.exec(first.content);
  if (!match) return null;
  first.content = first.content.slice(match[0].length);
  return match[1] !== " ";
}

/**
 * markdown-it core rule. Applies task-list markers, block callouts and inline badges, and
 * tags definition-style bullet lists so they can be set as a description list.
 */
export function calloutsPlugin(md: {
  core: { ruler: { push: (name: string, fn: (state: { tokens: Token[] }) => void) => void } };
}): void {
  md.core.ruler.push("review_md_callouts", (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type !== "inline") continue;

      const prev = tokens[i - 1];
      const prevPrev = tokens[i - 2];
      const inCell = prev?.type === "td_open" || prev?.type === "th_open";
      const inHeading = prev?.type === "heading_open";

      // A list item hosts the callout itself (not its first paragraph): in a tight list that
      // paragraph is `hidden` and never renders an element to hang the class on.
      const host =
        prevPrev?.type === "list_item_open"
          ? prevPrev
          : prev?.type === "paragraph_open"
            ? prev
            : null;

      if (host) {
        const checked = takeTaskMarker(token);
        if (checked !== null) {
          addClass(host, "task");
          const box = htmlToken(`<input type="checkbox" disabled${checked ? " checked" : ""}> `);
          token.children = [box, ...(token.children ?? [])];
        }
      }

      if (host && !inCell && !inHeading) {
        const leading = takeLeadingGlyphs(token);
        if (leading) {
          addClass(host, `callout callout-${leading.kind}`);
          token.children = [htmlToken(`${leading.marks} `), ...(token.children ?? [])];
        }
      }

      badgeInlineGlyphs(token);
    }

    tagDefinitionLists(tokens);
    tagTaskLists(tokens);
  });
}

/**
 * `- **Term** — definition` lists are how a glossary is usually written in markdown. Tag them so
 * the stylesheet can set the term and hang the dash, instead of rendering a wall of bullets.
 */
function tagDefinitionLists(tokens: Token[]): void {
  for (let i = 0; i < tokens.length; i += 1) {
    const open = tokens[i];
    if (open.type !== "bullet_list_open") continue;

    let items = 0;
    let definitions = 0;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token.type === "bullet_list_close" && token.level === open.level) break;
      if (token.type !== "list_item_open" || token.level !== open.level + 1) continue;

      items += 1;
      const inline = tokens.slice(j + 1, j + 4).find((t) => t.type === "inline");
      // markdown-it emits an empty text token ahead of leading inline markup, so the `**Term**`
      // is at index 1, not 0.
      const children = (inline?.children ?? []).filter(
        (child, index) => index > 0 || child.type !== "text" || child.content !== "",
      );
      const opensWithTerm = children[0]?.type === "strong_open";
      const afterTerm = children.findIndex((t) => t.type === "strong_close");
      const tail = afterTerm >= 0 ? (children[afterTerm + 1]?.content ?? "") : "";
      if (opensWithTerm && /^\s*[—–-]\s/.test(tail)) definitions += 1;
    }

    if (items >= 2 && definitions >= Math.ceil(items * 0.6)) addClass(open, "deflist");
  }
}

function tagTaskLists(tokens: Token[]): void {
  for (let i = 0; i < tokens.length; i += 1) {
    const open = tokens[i];
    if (open.type !== "bullet_list_open") continue;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token.type === "bullet_list_close" && token.level === open.level) break;
      if (token.type === "list_item_open" && token.attrGet("class")?.includes("task")) {
        addClass(open, "tasklist");
        break;
      }
    }
  }
}
