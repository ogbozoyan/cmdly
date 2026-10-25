#!/usr/bin/env bash
# Cuts a release from your machine: bumps the version, commits, tags and pushes.
# The tag triggers .github/workflows/release.yml, which builds the zip and publishes the GitHub release.
# (You can do the same from GitHub: Actions → Release → Run workflow.)
#
#   npm run release              # patch: 1.2.3 → 1.2.4
#   npm run release -- minor     # 1.2.3 → 1.3.0
#   npm run release -- major     # 1.2.3 → 2.0.0
#   npm run release -- 2.0.0     # explicit version
set -euo pipefail

BUMP="${1:-patch}"
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

git pull --ff-only --tags

VERSION="$(node scripts/version.mjs "$BUMP")"
if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  git checkout -- static/manifest.json package.json package-lock.json
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

npm run check

git add static/manifest.json package.json package-lock.json
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Cmdly $VERSION"
git push origin main "v$VERSION"

echo
echo "Pushed v$VERSION. Release pipeline: https://github.com/ogbozoyan/cmdly/actions/workflows/release.yml"
