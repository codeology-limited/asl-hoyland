export type Mode = 'development' | 'production';

type Inputs = {
  appMode?: string | undefined;
  nodeEnv?: string | undefined;
  viteDev?: boolean | undefined;
  viteProd?: boolean | undefined;
  viteMode?: string | undefined;
};

// Pure function for testability
export function computeMode(inputs: Inputs): Mode {
  const { appMode, nodeEnv, viteDev, viteProd, viteMode } = inputs;

  // Highest precedence: explicit app mode
  const m = (appMode ?? '').toLowerCase();
  if (m === 'production' || m === 'prod') return 'production';
  if (m === 'development' || m === 'dev') return 'development';

  // Next: Vite/TAURI build flags
  if (viteProd === true) return 'production';
  if (viteDev === true) return 'development';
  if ((viteMode ?? '').toLowerCase() === 'production') return 'production';

  // Finally: Node env
  const n = (nodeEnv ?? '').toLowerCase();
  if (n === 'production') return 'production';
  if (n === 'development') return 'development';

  // Default to development
  return 'development';
}

// Runtime detector reading from actual environment
export function detectMode(): Mode {
  // Prefer explicit app-level toggle via env
  const appMode = (typeof process !== 'undefined' ? process?.env?.APP_MODE as string | undefined : undefined) ?? undefined;

  // Read Vite/TAURI flags if present
  // Vitest and Vite provide import.meta.env in transformed modules
  // Guard in case not present (e.g., Node-only contexts)
  // In Vite/Vitest contexts, import.meta.env is defined
  let metaEnv: any = undefined;
  try {
    // Access guarded to avoid syntax errors in non-Vite toolchains
    // eslint-disable-next-line no-new-func
    metaEnv = (Function('return typeof import !== "undefined" && import.meta && import.meta.env')() as any) || undefined;
  } catch {
    metaEnv = undefined;
  }

  const viteDev = Boolean(metaEnv?.DEV);
  const viteProd = Boolean(metaEnv?.PROD);
  const viteMode = (metaEnv?.MODE as string | undefined) ?? undefined;

  const nodeEnv = (typeof process !== 'undefined' ? process?.env?.NODE_ENV as string | undefined : undefined) ?? undefined;

  return computeMode({ appMode, nodeEnv, viteDev, viteProd, viteMode });
}

export const isDev: boolean = detectMode() === 'development';
export const isProd: boolean = !isDev;
