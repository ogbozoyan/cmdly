#!/usr/bin/env bash
# Cuts a release: bumps the version, commits, tags and pushes.
# The tag triggers .github/workflows/release.yml, which builds the zip and publishes the GitHub release.
#
#   npm run release -- 1.2.0
set -euo pipefail

VERSION="${1:-}"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: npm run release -- <major.minor.patch>   (e.g. 1.2.0)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean — commit or stash your changes first." >&2
  exit 1
fi
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Releases are cut from main." >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

git pull --ff-only

# Chrome Web Store requires the manifest version; package.json is kept in sync.
node -e '
  const fs = require("fs");
  for (const file of ["static/manifest.json", "package.json"]) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.version = process.argv[1];
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }
' "$VERSION"
npm install --package-lock-only --silent

npm run check

git add static/manifest.json package.json package-lock.json
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Cmdly $VERSION"
git push origin main "v$VERSION"

echo
echo "Pushed v$VERSION. Release pipeline: https://github.com/ogbozoyan/cmdly/actions/workflows/release.yml"
