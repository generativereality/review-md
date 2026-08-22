/**
 * Footnote integrity, checked against the raw markdown before anything renders.
 *
 * Both of these have bitten a real document pack, and neither is detectable in the output:
 *
 *   - A **duplicate** `[^n]:` label — markdown-it (like every other renderer) keeps the first
 *     definition, drops the rest, and says nothing. A finding silently lost its provenance.
 *   - An **orphaned** definition, referenced from nowhere. It renders at the foot of the page
 *     looking cited, while the figure it was written for sits uncited in the body.
 *
 * So the check has to be ours. Missing definitions are included too — markdown-it leaves the
 * literal `[^7]` in the prose, which is easy to skim past on a screen-share.
 */

import { relative } from "node:path";

export type FootnoteProblem = {
  kind: "duplicate-definition" | "unreferenced-definition" | "missing-definition";
  label: string;
  /** 1-indexed source lines, so the warning is clickable in an editor. */
  lines: number[];
  message: string;
};

/**
 * Blank out fenced code, indented code and inline code spans, preserving byte offsets and
 * line breaks so reported line numbers stay true. A `[^n]` inside a snippet is not a footnote.
 */
function maskCode(markdown: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, " ");

  return markdown
    .replace(/^(?: {4}|\t)[^\n]*$/gm, blank) // indented code block
    .replace(/^([ \t]*)(`{3,}|~{3,})[\s\S]*?^\1?\2[^\n]*$/gm, blank) // fenced block
    .replace(/`+[^`\n]*`+/g, blank); // inline code span
}

export function checkFootnotes(markdown: string): FootnoteProblem[] {
  const source = maskCode(markdown);
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const definitions = new Map<string, number[]>();
  const definitionOffsets = new Set<number>();
  const definitionPattern = /^ {0,3}\[\^([^\]\s]+)\]:/gm;
  for (let match = definitionPattern.exec(source); match; match = definitionPattern.exec(source)) {
    const label = match[1];
    definitionOffsets.add(match.index + match[0].indexOf("[^"));
    definitions.set(label, [...(definitions.get(label) ?? []), lineOf(match.index)]);
  }

  const references = new Map<string, number[]>();
  const referencePattern = /\[\^([^\]\s]+)\]/g;
  for (let match = referencePattern.exec(source); match; match = referencePattern.exec(source)) {
    if (definitionOffsets.has(match.index)) continue; // the definition's own label
    const label = match[1];
    references.set(label, [...(references.get(label) ?? []), lineOf(match.index)]);
  }

  const problems: FootnoteProblem[] = [];

  for (const [label, lines] of definitions) {
    if (lines.length > 1) {
      problems.push({
        kind: "duplicate-definition",
        label,
        lines,
        message: `[^${label}] is defined ${lines.length}× (lines ${lines.join(", ")}) — only the first survives; the others are silently dropped`,
      });
    }
    if (!references.has(label)) {
      problems.push({
        kind: "unreferenced-definition",
        label,
        lines,
        message: `[^${label}] is defined (line ${lines[0]}) but never referenced — whatever it cites is uncited in the body`,
      });
    }
  }

  for (const [label, lines] of references) {
    if (!definitions.has(label)) {
      problems.push({
        kind: "missing-definition",
        label,
        lines,
        message: `[^${label}] is referenced (line ${lines.join(", ")}) with no definition — renders as literal text`,
      });
    }
  }

  return problems.sort((a, b) => a.lines[0] - b.lines[0]);
}

/** Prints the problems and returns whether any were found. */
export function reportFootnoteProblems(sourcePath: string, problems: FootnoteProblem[]): boolean {
  if (problems.length === 0) return false;
  const where = relative(process.cwd(), sourcePath) || sourcePath;
  for (const problem of problems) {
    console.warn(`⚠ footnotes  ${where}:${problem.lines[0]}  ${problem.message}`);
  }
  return true;
}
