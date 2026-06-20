#!/bin/bash
# Package the Next.js standalone build for deployment to another server.
# Run from project root after: npm run build

set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

STANDALONE_DIR="$PROJECT_ROOT/.next/standalone"
OUTPUT_ARCHIVE="webapp-ai-standalone.tar.gz"

if [ ! -f "$STANDALONE_DIR/server.js" ]; then
  echo "Error: Standalone build not found. Run 'npm run build' first."
  exit 1
fi

echo "Packaging standalone build from $STANDALONE_DIR ..."

# Copy public folder into standalone (Next.js does not include it by default)
if [ -d "$PROJECT_ROOT/public" ]; then
  cp -r "$PROJECT_ROOT/public" "$STANDALONE_DIR/public"
  echo "  - Copied public/ -> standalone/public/"
fi

# Ensure .next/static exists in standalone (usually already there; copy if missing)
if [ -d "$PROJECT_ROOT/.next/static" ] && [ ! -d "$STANDALONE_DIR/.next/static" ]; then
  cp -r "$PROJECT_ROOT/.next/static" "$STANDALONE_DIR/.next/static"
  echo "  - Copied .next/static/ -> standalone/.next/static/"
fi

# Optional: copy database config so the other server can use it or replace it
mkdir -p "$STANDALONE_DIR/data"
if [ -f "$PROJECT_ROOT/src/data/db-config.json" ]; then
  cp "$PROJECT_ROOT/src/data/db-config.json" "$STANDALONE_DIR/data/db-config.json"
  echo "  - Copied src/data/db-config.json -> standalone/data/db-config.json"
fi

# Create tarball from standalone directory
cd "$(dirname "$STANDALONE_DIR")"
tar -czf "$PROJECT_ROOT/$OUTPUT_ARCHIVE" standalone
cd "$PROJECT_ROOT"

echo "Done. Archive: $PROJECT_ROOT/$OUTPUT_ARCHIVE"
echo "Copy to server and run: tar -xzf $OUTPUT_ARCHIVE && cd standalone && PORT=8000 node server.js"
