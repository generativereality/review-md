#!/usr/bin/env bash
# Install render-doc — markdown → one self-contained styled HTML file
set -euo pipefail

echo "Installing render-doc..."

if command -v npm &>/dev/null; then
    npm install -g @generativereality/render-doc
elif command -v bun &>/dev/null; then
    bun install -g @generativereality/render-doc
else
    echo "Error: npm or bun required" >&2
    exit 1
fi

echo ""
echo "✓ render-doc installed"
echo ""

# `npm -g` installs into the npm prefix, which is not always on PATH — the usual symptom is
# "render-doc: command not found" straight after a clean install.
if ! command -v render-doc &>/dev/null; then
    echo "⚠ render-doc is not on your PATH. It was installed into:"
    echo "    $(npm prefix -g)/bin"
    echo "  Add that to PATH, e.g.:"
    echo "    echo 'export PATH=\"\$(npm prefix -g)/bin:\$PATH\"' >> ~/.zshrc && exec zsh"
    echo ""
fi

echo "Diagrams (optional):"
echo "  \`\`\`mermaid fences render to inline SVG in a headless Chromium."
echo "  If you don't have one:  npx playwright install chromium"
echo "  Or render without them: render-doc <doc.md> --no-diagrams"
echo ""
echo "Quick start:"
echo "  render-doc docs/PLAN.md                     # → rendered-docs/PLAN.html"
echo "  render-doc --manifest packs/planning.json   # a whole pack + an index.html"
echo "  render-doc --help"
echo ""
echo "Claude Code skill:"
echo "  mkdir -p .claude/skills/render-doc"
echo "  curl -fsSL https://raw.githubusercontent.com/generativereality/render-doc/main/skills/render-doc/SKILL.md \\"
echo "    -o .claude/skills/render-doc/SKILL.md"
