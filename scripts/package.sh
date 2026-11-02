#!/usr/bin/env bash
# Zips dist/ into cmdly.zip — the file you upload to the Chrome Web Store. The version lives in
# manifest.json; the release job renames the archive to cmdly-<version>.zip (see release.yml).
# Run `npm run package` (it builds and tests first).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/cmdly.zip"

rm -f "$OUT"
(cd "$ROOT/dist" && zip -qr -X "$OUT" . -x "*.DS_Store")
echo "Created $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
