#!/usr/bin/env bash
# In-repo copy of the leak check, so contributors and CI get it without any machine setup.
# The machine-wide twin lives at ~/.config/leakcheck/leakcheck.sh and is run by a global
# pre-push hook; keep them in step.
# Shared leak check. Scans TRACKED files — what a push actually publishes.
#
# Rule 1 (allowlist, always on): every URL inside a dependency lockfile must point at a
#   known-public host. An allowlist needs no knowledge of which private mirror to fear, so it
#   catches the next one too, and it lets this script exist without embedding sensitive strings.
#   Covers every lockfile format, because the first version only knew package-lock.json and
#   bun.lock walked straight past it into two public repos.
# Rule 2 (denylist, opt-in): regexes from ~/.config/leakcheck/denylist.txt — internal hostnames,
#   employer names, work addresses. Kept outside every repo: a committed denylist publishes what
#   it protects.
#
# Usage: leakcheck.sh [--fix]
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

PUBLIC="https://registry.npmjs.org/"
DENYLIST="${LEAKCHECK_DENYLIST:-$HOME/.config/leakcheck/denylist.txt}"
# Hosts a lockfile may legitimately name.
ALLOWED_HOSTS='registry\.npmjs\.org|registry\.yarnpkg\.com|codeload\.github\.com|github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com|gitlab\.com|bitbucket\.org'
LOCKFILES='package-lock.json npm-shrinkwrap.json bun.lock bun.lockb yarn.lock pnpm-lock.yaml pnpm-workspace.yaml deno.lock'

FIX=false
FILES_FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fix) FIX=true ;;
    --files-from) FILES_FROM="$2"; shift ;;
  esac
  shift
done
FAILED=0

# The set of files to examine. A pre-push hook passes only what is actually being pushed:
# scanning every tracked file took 65s on a large monorepo, which is a hook nobody keeps.
# With no list, scan everything (manual runs, CI).
listfiles() {
  if [ -n "$FILES_FROM" ]; then cat "$FILES_FROM"; else git ls-files; fi
}

CANDIDATES=$(listfiles)
for name in $LOCKFILES; do
  for lock in $(printf '%s\n' "$CANDIDATES" | grep -E "(^|/)$(printf '%s' "$name" | sed 's/\./\\./g')$" || true); do
    [ -f "$lock" ] || continue
    # Only RESOLUTION urls — a `funding` link to some maintainer's blog is not a leak, and
    # flagging it trains you to ignore the check. Resolution urls are the ones after a
    # `resolved` key, or that carry npm's `/-/` tarball convention.
    foreign=$( { grep -oiE '"?resolved"? *[:=]? *"?https?://[A-Za-z0-9._-]+' "$lock" 2>/dev/null
                 grep -oE 'https?://[A-Za-z0-9._-]+[^ "]*/-/[^ "]+' "$lock" 2>/dev/null
                 grep -oE 'https?://[A-Za-z0-9._-]+[^ "]*\.(tgz|tar\.gz)' "$lock" 2>/dev/null
               } | grep -oE 'https?://[A-Za-z0-9._-]+' | sed -E 's#https?://##' \
                 | sort -u | grep -vE "^($ALLOWED_HOSTS)$")
    [ -z "$foreign" ] && continue

    if [ "$FIX" = true ]; then
      for host in $foreign; do
        # Strip the mirror's host AND its proxy path prefix, leaving the canonical
        # <pkg>/-/<tarball> tail. Tarballs are identical wherever proxied from, so the
        # sha512 integrity values stay correct — only the URL prefix changes.
        perl -pi -e 's{https?://\Q'"$host"'\E/\S*?((?:\@[^/"\s]+/)?[^/"\s]+/-/)}{'"$PUBLIC"'$1}g' "$lock"
      done
      echo "fixed   $lock"
    else
      echo "LEAK    $lock references non-public host(s):"
      echo "$foreign" | sed 's/^/          /'
      echo "        Fix: ~/.config/leakcheck/leakcheck.sh --fix"
      FAILED=1
    fi
  done
done

if [ -f "$DENYLIST" ]; then
  while IFS= read -r pattern; do
    case "$pattern" in ''|'#'*) continue ;; esac
    severity=block
    case "$pattern" in warn:*) severity=warn; pattern=${pattern#warn:} ;; esac
    hits=$(printf '%s\n' "$CANDIDATES" | tr '\n' '\0' | xargs -0 -r grep -IlE "$pattern" 2>/dev/null)
    [ -z "$hits" ] && continue
    if [ "$severity" = warn ]; then
      echo "warn    /$pattern/ appears in — intentional in a bio, wrong in a config:"
      echo "$hits" | sed 's/^/          /'
    else
      echo "LEAK    /$pattern/ in tracked files:"
      echo "$hits" | sed 's/^/          /'
      FAILED=1
    fi
  done < "$DENYLIST"
fi

[ "$FAILED" -ne 0 ] && { echo ""; echo "✗ leak check failed — NOT safe to push"; exit 1; }
echo "✓ leak check passed"
exit 0
