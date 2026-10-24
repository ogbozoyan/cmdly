#!/usr/bin/env bash
# Zips dist/ into cmdly-<version>.zip — the file you upload to the Chrome Web Store
# or attach to a GitHub release. Run `npm run package` (it builds and tests first).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/static/manifest.json').version")"
OUT="$ROOT/cmdly-$VERSION.zip"

rm -f "$OUT"
(cd "$ROOT/dist" && zip -qr -X "$OUT" . -x "*.DS_Store")
echo "Created $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
