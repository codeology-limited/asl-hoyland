#!/bin/bash
# Usage: ./scripts/release.sh
# Bumps patch version (1.6.11 -> 1.6.12), updates all version files,
# commits, tags, and pushes to trigger the release workflow.

set -e

# Read current version from tauri.conf.json
CURRENT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).package.version)")
echo "Current version: ${CURRENT}"

# Parse and bump (standard semver patch increment, no rollover)
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT}"
PATCH=$((PATCH + 1))
NEW="${MAJOR}.${MINOR}.${PATCH}"
echo "New version: ${NEW}"

# Update all version files using node (cross-platform)
NEW="${NEW}" CURRENT="${CURRENT}" node -e '
const fs = require("fs");
const NEW = process.env.NEW;
const CURRENT = process.env.CURRENT;

// tauri.conf.json
const tc = "src-tauri/tauri.conf.json";
const j = JSON.parse(fs.readFileSync(tc, "utf8"));
j.package.version = NEW;
fs.writeFileSync(tc, JSON.stringify(j, null, 2) + "\n");

// package.json
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = NEW;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// src-tauri/Cargo.toml (only the first [package] version line)
const cargoPath = "src-tauri/Cargo.toml";
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = ".*"/m, "version = \"" + NEW + "\"");
fs.writeFileSync(cargoPath, cargo);

// App.tsx
const app = "src/App.tsx";
fs.writeFileSync(app, fs.readFileSync(app, "utf8").replace("v" + CURRENT, "v" + NEW));

// App.test.tsx
const test = "src/__tests__/App.test.tsx";
fs.writeFileSync(test, fs.readFileSync(test, "utf8").replace("v" + CURRENT, "v" + NEW));
'

# Commit, tag, push
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json src/App.tsx src/__tests__/App.test.tsx
git commit -m "release v${NEW}"
git tag "v${NEW}"
git push origin master --tags

echo ""
echo "Released v${NEW} -- check GitHub Actions for build status"
echo "https://github.com/codeology-limited/asl-hoyland/actions"
