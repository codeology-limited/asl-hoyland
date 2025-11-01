# Repository Guidelines

## Project Structure & Module Organization
- `src/` — React + TypeScript app (e.g., `src/App.tsx`, `src/util/`, `src/assets/`).
- `public/` — Static assets served by Vite.
- `src-tauri/` — Tauri Rust backend and bundling config (`Cargo.toml`, `tauri.conf.json`).
- `dist/` — Frontend build output (generated).
- Root: `Makefile`, `package.json`, `vite.config.ts`, `tsconfig*.json`.

## Build, Test, and Development Commands
- `npm run dev` — Start Vite dev server on `http://localhost:1420`.
- `npm run build` — Type-check (`tsc`) and build the frontend.
- `npm run tauri:dev` or `make dev` — Run Tauri app in dev mode.
- `cargo tauri build --target x86_64-pc-windows-gnu` — Build desktop app (Windows target).
- `make nsis` / `make msi` — Clean, build, and package installers; edits `src-tauri/tauri.conf.json` targets.

## Coding Style & Naming Conventions
- TypeScript + React; 2-space indentation; semicolons optional, stay consistent.
- Components/files: `PascalCase` (e.g., `StatusIndicator.tsx`). Functions/vars: `camelCase`.
- Prefer named exports; colocate helpers under `src/util/`; images/fonts in `src/assets/`.
- No linter is configured; follow TS compiler hints and existing patterns.

## Testing Guidelines
- No formal test suite yet. If adding tests:
  - Frontend: Vitest + React Testing Library; name files `*.test.ts[x]` near sources.
  - Rust (Tauri): use `cargo test` with unit tests inside `src-tauri/src/`.
  - Aim for coverage on critical logic (serial/IO, context state, program editors).

## Commit & Pull Request Guidelines
- Commit messages in history are terse; please adopt Conventional Commits going forward:
  - Example: `feat(ui): add error boundary to app shell`.
- PRs should include: concise description, linked issues, build output or screenshots if UI changes, and notes on platform impact (Windows packaging).

## Security & Configuration Tips
- App port and dev path are set in `vite.config.ts` and `src-tauri/tauri.conf.json`; avoid hardcoding secrets.
- Windows packaging uses MinGW (`x86_64-pc-windows-gnu`); ensure toolchain is installed before running `make` targets.
