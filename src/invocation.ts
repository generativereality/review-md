/**
 * Invocations that parse cleanly, do something other than what was asked, and exit 0.
 *
 * Both were found rendering real packs, and both disarm `--strict`, the one flag whose job
 * is to make a bad run fail — so the run that most needed checking reported success.
 * They are refused here, before anything renders, instead of documented as traps.
 */

/** Long options this CLI declares, so a flag stranded as a positional can be recognised. */
export function knownFlags(options: Readonly<Record<string, { readonly type: string; readonly short?: string }>>): Set<string> {
  const flags = new Set<string>();
  for (const [name, spec] of Object.entries(options) as [string, { readonly type: string; readonly short?: string }][]) {
    flags.add(`--${name}`);
    if (spec.short) flags.add(`-${spec.short}`);
  }
  return flags;
}

/**
 * Why this invocation must not run, or null when it is fine.
 *
 * @param argv        the raw arguments (`process.argv.slice(2)`)
 * @param positionals what `parseArgs` resolved as positionals
 * @param flags       from {@link knownFlags}
 * @param manifest    whether `--manifest` was given
 */
export function invocationProblem(
  argv: readonly string[],
  positionals: readonly string[],
  flags: ReadonlySet<string>,
  manifest: boolean,
): string | null {
  // 1. `--` ends option parsing, so every flag after it becomes a positional — and the second
  //    positional is the DESTINATION. `review-md -- doc.md --strict` wrote the HTML to a file
  //    named `--strict`, printed `✓ --strict` and exited 0 with the footnote check never run.
  //    Only a known flag name is refused: a `--` before a file that genuinely starts with `-`
  //    is the escape hatch parseArgs itself recommends, and it stays open.
  const terminator = argv.indexOf("--");
  if (terminator !== -1) {
    const stranded = argv.slice(terminator + 1).filter((arg) => flags.has(arg.split("=")[0]));
    if (stranded.length > 0) {
      const names = stranded.map((f) => `'${f}'`).join(", ");
      return (
        `${names} came after '--', which ends option parsing, so ${stranded.length > 1 ? "they" : "it"} would be ` +
        `read as a file path instead of a flag (the second path is where the HTML is written). ` +
        `Drop the '--': flag order does not matter here.`
      );
    }
  }

  // 2. A pack manifest passed as a source renders the JSON's text as a document: one ✓ at
  //    rendered-docs/<pack>.html, exit 0, and not one doc in the pack re-rendered or checked.
  const source = positionals[0];
  if (!manifest && source !== undefined && source.toLowerCase().endsWith(".json")) {
    return (
      `'${source}' is a JSON file, not markdown. To render a pack, pass it as ` +
      `--manifest ${source}`
    );
  }

  return null;
}
