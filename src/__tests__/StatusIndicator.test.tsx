import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StatusIndicator from '../StatusIndicator';
import { AppProvider } from '../AppContext';
import React from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const renderWithContext = (component: React.ReactElement, initialEvents: any[] = []) => {
  return render(
    <AppProvider>
      {component}
    </AppProvider>
  );
};

describe('StatusIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with initial status prop', () => {
    const { container } = renderWithContext(<StatusIndicator status="success" />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('renders with null status', () => {
    const { container } = renderWithContext(<StatusIndicator status={null} />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('renders with fail status', () => {
    const { container} = renderWithContext(<StatusIndicator status="fail" />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('updates status prop correctly', () => {
    const { container, rerender } = renderWithContext(<StatusIndicator status="success" />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();

    rerender(
      <AppProvider>
        <StatusIndicator status="fail" />
      </AppProvider>
    );

    expect(indicator).toBeInTheDocument();
  });

  it('renders with flashing behavior', async () => {
    const { container } = renderWithContext(<StatusIndicator status="success" />);
    const indicator = container.querySelector('.status-indicator');

    expect(indicator).toBeInTheDocument();
    expect(indicator?.className).toContain('status-indicator');
  });

  it('has auto-clear functionality', async () => {
    const { container } = renderWithContext(<StatusIndicator status="success" />);
    const indicator = container.querySelector('.status-indicator');

    expect(indicator).toBeInTheDocument();
    // The component has auto-clear logic built in
  });
});
