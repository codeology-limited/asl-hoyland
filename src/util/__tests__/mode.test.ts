import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeMode, detectMode, type Mode } from '../mode';

describe('mode util', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envBackup };
    delete process.env.APP_MODE;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('computeMode respects APP_MODE first', () => {
    expect(
      computeMode({ appMode: 'production', nodeEnv: 'development', viteDev: true })
    ).toBe('production');
    expect(
      computeMode({ appMode: 'dev', nodeEnv: 'production', viteProd: true })
    ).toBe('development');
  });

  it('computeMode uses Vite flags next', () => {
    expect(computeMode({ viteProd: true })).toBe('production');
    expect(computeMode({ viteDev: true })).toBe('development');
    expect(computeMode({ viteMode: 'production' })).toBe('production');
  });

  it('computeMode falls back to NODE_ENV', () => {
    expect(computeMode({ nodeEnv: 'production' })).toBe('production');
    expect(computeMode({ nodeEnv: 'development' })).toBe('development');
    expect(computeMode({})).toBe('development');
  });

  it('detectMode honors APP_MODE at runtime', async () => {
    process.env.APP_MODE = 'production';
    const { detectMode: detect } = await import('../mode');
    expect(detect()).toBe('production');
  });
});

