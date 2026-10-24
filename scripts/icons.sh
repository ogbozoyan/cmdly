#!/usr/bin/env bash
# Renders static/icons/icon.svg into PNG sizes required by Chrome using headless Chrome.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/static/icons/icon.svg"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for size in 16 32 48 128; do
  cat > "$TMP/icon.html" <<EOF
<html><body style="margin:0;background:transparent">
<img src="file://$SVG" width="$size" height="$size" style="display:block">
</body></html>
EOF
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 --allow-file-access-from-files \
    --window-size="$size,$size" --screenshot="$ROOT/static/icons/$size.png" \
    "file://$TMP/icon.html" >/dev/null 2>&1
  echo "icons/$size.png"
done
