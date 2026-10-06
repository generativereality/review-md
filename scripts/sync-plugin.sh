#!/usr/bin/env bash
# Sync review-md plugin files to the generativereality/plugins marketplace repo.
#
# Usage:
#   ./scripts/sync-plugin.sh          # sync + commit + push
#   ./scripts/sync-plugin.sh --check  # just verify
#
# Expects the plugins repo at ../plugins (alongside this repo).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGINS_DIR="$REPO_ROOT/../plugins"
CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

if [ ! -d "$PLUGINS_DIR/.git" ]; then
  echo "Error: plugins repo not found at $PLUGINS_DIR"
  echo "Clone it:  git clone https://github.com/generativereality/plugins $(cd "$REPO_ROOT/.." && pwd)/plugins"
  exit 1
fi

ERRORS=0

# The plugin payload: the manifest, plus the WHOLE skill directory.
#
# This used to be a fixed list naming SKILL.md alone, so anything under
# skills/review-md/references/ never reached the marketplace — and --check could
# not notice, because it only diffed the files on that list. SKILL.md links to
# references/print-length.md; synced from a list, every installed copy would
# link to a file that isn't there. A directory has no list to forget to extend.
SKILL_REL="skills/review-md"
MANIFEST_REL=".claude-plugin/plugin.json"
DEST="$PLUGINS_DIR/plugins/review-md"

if ! diff -q "$REPO_ROOT/$MANIFEST_REL" "$DEST/$MANIFEST_REL" >/dev/null 2>&1; then
  echo "MISMATCH: $MANIFEST_REL differs from plugins repo"
  ERRORS=1
fi
# -r catches added, changed AND removed files, so a reference deleted here is
# flagged too rather than lingering in the marketplace.
if ! diff -rq "$REPO_ROOT/$SKILL_REL" "$DEST/$SKILL_REL" >/dev/null 2>&1; then
  echo "MISMATCH: $SKILL_REL/ differs from plugins repo"
  diff -rq "$REPO_ROOT/$SKILL_REL" "$DEST/$SKILL_REL" 2>&1 | sed 's/^/  /' || true
  ERRORS=1
fi

if [ "$CHECK_ONLY" = true ]; then
  if [ "$ERRORS" -ne 0 ]; then
    echo ""
    echo "Run: ./scripts/sync-plugin.sh"
    exit 1
  fi
  echo "Plugins repo in sync"
  exit 0
fi

mkdir -p "$DEST/.claude-plugin" "$DEST/skills"
cp -p "$REPO_ROOT/$MANIFEST_REL" "$DEST/$MANIFEST_REL"
# Replace rather than overlay, so a file removed here is removed there too.
rm -rf "${DEST:?}/$SKILL_REL"
cp -Rp "$REPO_ROOT/$SKILL_REL" "$DEST/$SKILL_REL"

cd "$PLUGINS_DIR"
if git diff --quiet && [ -z "$(git status --porcelain plugins/review-md)" ]; then
  echo "Plugins repo already up to date"
  exit 0
fi

git add plugins/review-md
git commit -m "chore: sync review-md plugin"
git push

echo "Synced review-md to plugins repo"
