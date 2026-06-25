# End-to-end tests (Playwright)

Browser-driven tests for the program editor — create / edit / save / reload,
ranged programs, add/remove + drag-reorder rows, validation, and persistence.

These are separate from the unit tests (`npm test`, Vitest). Vitest only globs
`src/**/__tests__`, so these `*.e2e.ts` files are never picked up by it.

## Run

```bash
npx playwright install chromium   # once, to fetch the browser
npm run e2e                        # headless (auto-starts the vite dev server)
npm run e2e:headed                 # watch it drive a real browser
npm run e2e:report                 # open the HTML report after a run
```

`playwright.config.ts` starts `npm run dev` on :1420 automatically (or reuses a
dev server already running there). Each test runs in an isolated browser context,
so IndexedDB (where saved programs live) starts empty per test.
