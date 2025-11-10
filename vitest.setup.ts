import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import fs from 'node:fs';
import path from 'node:path';

const defaultsPath = path.resolve(process.cwd(), 'public/defaultPrograms.json');
let cachedDefaults: unknown = null;

try {
  cachedDefaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
} catch (err) {
  console.warn('Could not read default programs during tests:', err);
}

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/defaultPrograms.json') && cachedDefaults !== null) {
    return new Response(JSON.stringify(cachedDefaults), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (typeof originalFetch === 'function') {
    return originalFetch(input, init);
  }
  throw new Error('No fetch implementation available');
};
