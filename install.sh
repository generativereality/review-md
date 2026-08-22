#!/usr/bin/env bash
# Install review-md — markdown → one self-contained styled HTML file
set -euo pipefail

echo "Installing review-md..."

if command -v npm &>/dev/null; then
    npm install -g @generativereality/review-md
elif command -v bun &>/dev/null; then
    bun install -g @generativereality/review-md
else
    echo "Error: npm or bun required" >&2
    exit 1
fi

echo ""
echo "✓ review-md installed"
echo ""

# `npm -g` installs into the npm prefix, which is not always on PATH — the usual symptom is
# "review-md: command not found" straight after a clean install.
if ! command -v review-md &>/dev/null; then
    echo "⚠ review-md is not on your PATH. It was installed into:"
    echo "    $(npm prefix -g)/bin"
    echo "  Add that to PATH, e.g.:"
    echo "    echo 'export PATH=\"\$(npm prefix -g)/bin:\$PATH\"' >> ~/.zshrc && exec zsh"
    echo ""
fi

echo "Diagrams (optional):"
echo "  \`\`\`mermaid fences render to inline SVG in a headless Chromium."
echo "  If you don't have one:  npx playwright install chromium"
echo "  Or render without them: review-md <doc.md> --no-diagrams"
echo ""
echo "Quick start:"
echo "  review-md docs/PLAN.md                     # → rendered-docs/PLAN.html"
echo "  review-md --manifest packs/planning.json   # a whole pack + an index.html"
echo "  review-md --help"
echo ""
echo "Claude Code skill:"
echo "  mkdir -p .claude/skills/review-md"
echo "  curl -fsSL https://raw.githubusercontent.com/generativereality/review-md/main/skills/review-md/SKILL.md \\"
echo "    -o .claude/skills/review-md/SKILL.md"
