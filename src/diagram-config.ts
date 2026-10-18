/**
 * What a diagram is and how mermaid is set up, with no Node in it: shared by the CLI's batch
 * render (`mermaid.ts`, in a headless Chromium) and the browser build (`web.ts`, in the page that
 * shows the document), so the two cannot drift.
 */

import { diagramTheme, TOKENS } from "./theme.ts";

/**
 * `mermaid`, and `mermaid` with attributes after it (` mermaid title="…"`), but not `mermaidjs`.
 * Shared with the fence renderer so the ordinal a diagram is looked up by cannot drift from the
 * ordinal it was rendered at.
 */
export function isMermaidFence(info: string): boolean {
  return /^mermaid(\s|$)/.test(info.trim().toLowerCase());
}


export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: diagramTheme(),
  fontFamily: TOKENS.body,
  /**
   * `<text>` elements, not HTML labels in a `<foreignObject>`. A foreignObject label looks fine
   * on screen and is the classic thing that comes out blank or clipped when the page is printed
   * to PDF — and this renderer's print path is half of what it's for.
   */
  htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: true },
  sequence: { useMaxWidth: true },
  state: { useMaxWidth: true },
} as const;

/**
 * The cuts mermaid measures labels in. `@font-face` is lazy — without asking for each one by
 * name, `document.fonts.ready` resolves against a page that has loaded nothing and every node box
 * gets sized for the fallback font instead of the one the reader will see.
 */
export const MEASURED_CUTS = [
  '400 14px "IBM Plex Sans"',
  '500 14px "IBM Plex Sans"',
  '600 14px "IBM Plex Sans"',
] as const;
