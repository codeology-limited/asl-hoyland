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

# Update tauri.conf.json
node -e "
const fs = require('fs');
const f = 'src-tauri/tauri.conf.json';
const j = JSON.parse(fs.readFileSync(f,'utf8'));
j.package.version = '$NEW';
fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
"

# Update App.tsx footer
sed -i.bak "s/v${CURRENT}/v${NEW}/g" src/App.tsx && rm -f src/App.tsx.bak

# Update App.test.tsx
sed -i.bak "s/v${CURRENT}/v${NEW}/g" src/__tests__/App.test.tsx && rm -f src/__tests__/App.test.tsx.bak

# Commit, tag, push
git add src-tauri/tauri.conf.json src/App.tsx src/__tests__/App.test.tsx
git commit -m "release v${NEW}"
git tag "v${NEW}"
git push origin master --tags

echo ""
echo "Released v${NEW} — check GitHub Actions for build status"
echo "https://github.com/codeology-limited/asl-hoyland/actions"
