/**
 * Everything the renderer knows about git — and it is deliberately little.
 *
 * The renderer works on a markdown file, not on a repo. A repo, when there is one, supplies three
 * niceties: a root to make paths readable against, a revision for the provenance line, and an
 * origin remote to rewrite in-repo `.md` links against. **All three are optional.** Rendering a
 * loose file in `~/notes` is a supported use and must produce the same document, minus those.
 *
 * Nothing in here throws. `git` not being installed, the directory not being a repo, and the repo
 * having no `origin` are all ordinary outcomes that return null.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

/** Runs git in `cwd`, returning its trimmed stdout — or null if git isn't there, or said no. */
function git(cwd: string, args: readonly string[]): string | null {
  try {
    const out = execFileSync("git", [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * The repo root containing `dir`, or null.
 *
 * Null is a supported outcome, not a failure: rendering a stray markdown file in `~/notes` is a
 * legitimate use, and it should produce the same document minus the provenance revision line.
 */
export function gitRoot(dir: string): string | null {
  return git(dir, ["rev-parse", "--show-toplevel"]);
}

const sshHostCache = new Map<string, string>();

/**
 * The real hostname behind an SSH host alias, via `ssh -G`.
 *
 * Multi-account setups routinely clone through a `~/.ssh/config` alias —
 * `git@github.work:owner/repo.git`, where `github.work` is a `Host` block whose `Hostname` is
 * `github.com`. Taken literally that produces `https://github.work/owner/repo`, a link that is
 * dead for everyone including the person who rendered it. `ssh -G` is the only thing that knows;
 * it echoes the input back unchanged when there is no alias, so this is safe to always call.
 */
function resolveSshHost(host: string): string {
  const cached = sshHostCache.get(host);
  if (cached !== undefined) return cached;

  let resolved = host;
  try {
    const config = execFileSync("ssh", ["-G", host], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = /^hostname (.+)$/m.exec(config);
    if (match) resolved = match[1].trim() || host;
  } catch {
    // No ssh, or it refused the host — the literal is the best guess available.
  }
  sshHostCache.set(host, resolved);
  return resolved;
}

/**
 * `git remote get-url origin`, normalised to a browsable https base — `git@host:owner/repo.git`
 * and `ssh://git@host/owner/repo.git` both become `https://host/owner/repo`.
 *
 * This is what the provenance footer links to and what an in-repo `.md` link is rewritten
 * against, so it has to describe the repo the *source document* lives in — never a constant
 * baked into the renderer, which is exactly how this tool used to hardcode one product's repo
 * into every artifact it produced.
 *
 * `resolveHost` is injectable purely so the SSH-alias behaviour is testable without a
 * `~/.ssh/config`; production always uses `resolveSshHost`.
 */
export function normaliseRemoteUrl(
  remote: string,
  resolveHost: (host: string) => string = resolveSshHost,
): string | null {
  const trimmed = remote.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // scp-style: git@github.com:owner/repo.git — the form an SSH clone leaves behind, and the one
  // an alias hides in.
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(trimmed);
  if (scp) return `https://${resolveHost(scp[1])}/${scp[2].replace(/\.git$/, "")}`;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "file:") return null;
    const pathname = url.pathname.replace(/\.git$/, "").replace(/^\/+/, "");
    if (!pathname) return null;
    // An ssh:// remote can carry an alias too; an https one is already a real hostname.
    const host = url.protocol === "ssh:" ? resolveHost(url.hostname) : url.host;
    // Drop any embedded credentials — these end up in a document handed to other people.
    return `https://${host}/${pathname}`;
  } catch {
    return null;
  }
}

const remoteCache = new Map<string, string | null>();

/** The origin remote of the repo owning `root`, cached — a pack asks for the same root N times. */
export function repoUrlFor(root: string | null): string | null {
  if (root === null) return null;
  if (!remoteCache.has(root)) {
    const remote = git(root, ["remote", "get-url", "origin"]);
    remoteCache.set(root, remote ? normaliseRemoteUrl(remote) : null);
  }
  return remoteCache.get(root) ?? null;
}

/**
 * The repo root that owns a given source file, so paths and GitHub links stay correct when the
 * doc lives in a different checkout or worktree than the one you're invoking from — e.g. running
 * the renderer out of its own worktree against a doc in another checkout. Resolving the root
 * from the cwd instead produced `blob/main/../other-repo/docs/…` footers and dead relative links.
 */
export function rootOwning(file: string, fallback: string): string {
  return gitRoot(path.dirname(file)) ?? fallback;
}

/** Short SHA + commit date of the last change to a file, for provenance on a screen-share. */
export function sourceRevision(file: string): string | null {
  return git(path.dirname(file), ["log", "-1", "--format=%h %cs", "--", path.basename(file)]);
}

/**
 * The source path as shown in the masthead and the footer. Repo-relative inside a repo; outside
 * one, relative to the cwd — and if the doc sits above the cwd entirely, just its basename,
 * because `../../../Desktop/notes.md` is provenance nobody can act on.
 */
export function displayPath(root: string, file: string): string {
  const relative = path.relative(root, file).split(path.sep).join("/");
  return !relative || relative.startsWith("../") ? path.basename(file) : relative;
}

