#!/usr/bin/env bash
set -euo pipefail

# Build script for uponproof.com static site deployment
# Produces: out/deploy/uponproof-site.tar.gz

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Building static site for uponproof.com..."

# Clean previous builds
rm -rf packages/web/out packages/web/.next out/deploy
mkdir -p out/deploy

# Build the static export
echo "→ Running Next.js static export..."
cd packages/web
pnpm build

# Verify the export succeeded
if [ ! -d "out" ]; then
  echo "✗ Static export failed - out/ directory not found"
  exit 1
fi

# Create tarball
echo "→ Creating deployment tarball..."
cd out
tar -czf "$REPO_ROOT/out/deploy/uponproof-site.tar.gz" .
cd "$REPO_ROOT"

# Report
TARBALL_SIZE=$(du -h "out/deploy/uponproof-site.tar.gz" | cut -f1)
PAGE_COUNT=$(find packages/web/out -name "*.html" | wc -l | tr -d ' ')

echo "✓ Build complete"
echo "  Tarball: out/deploy/uponproof-site.tar.gz ($TARBALL_SIZE)"
echo "  Pages: $PAGE_COUNT HTML files"
