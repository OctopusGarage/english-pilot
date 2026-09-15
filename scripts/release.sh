#!/usr/bin/env bash
# Cut a release: bump package.json, create a vX.Y.Z tag, and push it.
# GitHub Actions release.yml then creates and signs the GitHub Release artifact.
#
#   pnpm run release -- patch
#   pnpm run release -- minor
#   pnpm run release -- major
#   pnpm run release -- 1.2.3
set -euo pipefail

BUMP="${1:-}"
if [ -z "$BUMP" ]; then
  echo "usage: pnpm run release -- <patch|minor|major|X.Y.Z>" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "release must run on main (on '$BRANCH')" >&2
  exit 1
fi

git diff --quiet && git diff --cached --quiet || {
  echo "working tree not clean" >&2
  exit 1
}

git pull --ff-only origin main

NEW_TAG="$(pnpm version "$BUMP" -m "release: v%s")"
echo "Created $NEW_TAG"

git push --follow-tags origin main
echo "Pushed $NEW_TAG. GitHub Actions will publish the Release."
