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

# Files that ship inside the plugin payload. Relative to repo root.
PAYLOAD_FILES=(
  "skills/review-md/SKILL.md"
  ".claude-plugin/plugin.json"
)

for rel in "${PAYLOAD_FILES[@]}"; do
  if ! diff -q "$REPO_ROOT/$rel" "$PLUGINS_DIR/plugins/review-md/$rel" >/dev/null 2>&1; then
    echo "MISMATCH: $rel differs from plugins repo"
    ERRORS=1
  fi
done

if [ "$CHECK_ONLY" = true ]; then
  if [ "$ERRORS" -ne 0 ]; then
    echo ""
    echo "Run: ./scripts/sync-plugin.sh"
    exit 1
  fi
  echo "Plugins repo in sync"
  exit 0
fi

for rel in "${PAYLOAD_FILES[@]}"; do
  mkdir -p "$(dirname "$PLUGINS_DIR/plugins/review-md/$rel")"
  cp -p "$REPO_ROOT/$rel" "$PLUGINS_DIR/plugins/review-md/$rel"
done

cd "$PLUGINS_DIR"
if git diff --quiet && [ -z "$(git status --porcelain plugins/review-md)" ]; then
  echo "Plugins repo already up to date"
  exit 0
fi

git add plugins/review-md
git commit -m "chore: sync review-md plugin"
git push

echo "Synced review-md to plugins repo"
