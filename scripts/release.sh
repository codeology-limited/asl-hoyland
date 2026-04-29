#!/bin/bash
# Usage: ./scripts/release.sh
# Bumps patch version (1.6.0 → 1.6.1, 1.6.9 → 1.7.0), updates all version files,
# commits, tags, and pushes to trigger the release workflow.

set -e

# Read current version from tauri.conf.json
CURRENT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).package.version)")
echo "Current version: $CURRENT"

# Parse and bump
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
PATCH=$((PATCH + 1))
if [ "$PATCH" -gt 9 ]; then
  PATCH=0
  MINOR=$((MINOR + 1))
fi
NEW="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW"

# Update all version files using node (cross-platform)
node -e "
const fs = require('fs');

// tauri.conf.json
const tc = 'src-tauri/tauri.conf.json';
const j = JSON.parse(fs.readFileSync(tc,'utf8'));
j.package.version = '$NEW';
fs.writeFileSync(tc, JSON.stringify(j, null, 2) + '\n');

// App.tsx
const app = 'src/App.tsx';
fs.writeFileSync(app, fs.readFileSync(app,'utf8').replace('v$CURRENT', 'v$NEW'));

// App.test.tsx
const test = 'src/__tests__/App.test.tsx';
fs.writeFileSync(test, fs.readFileSync(test,'utf8').replace('v$CURRENT', 'v$NEW'));
"

# Commit, tag, push
git add src-tauri/tauri.conf.json src/App.tsx src/__tests__/App.test.tsx
git commit -m "release v${NEW}"
git tag "v${NEW}"
git push origin master --tags

echo ""
echo "Released v${NEW} — check GitHub Actions for build status"
echo "https://github.com/codeology-limited/asl-hoyland/actions"
