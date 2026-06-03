import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import StatusIndicator from '../StatusIndicator';
import { AppProvider, useAppContext, AppEvent } from '../AppContext';
import React, { useEffect } from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const renderWithContext = (component: React.ReactElement) => {
  return render(<AppProvider>{component}</AppProvider>);
};

// Helper component that pushes events into context on mount so we can
// exercise the event-driven status derivation.
const EmitEvents: React.FC<{ events: AppEvent[] }> = ({ events }) => {
  const { addEvent } = useAppContext();
  useEffect(() => {
    events.forEach((e) => addEvent(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

describe('StatusIndicator', () => {
  it('renders without requiring a status prop', () => {
    const { container } = renderWithContext(<StatusIndicator />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('still accepts an optional initial status prop', () => {
    const { container } = renderWithContext(<StatusIndicator status="success" />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('exposes an aria-live region for accessibility (non-color cue)', () => {
    const { container } = renderWithContext(<StatusIndicator />);
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toHaveAttribute('aria-live');
    expect(indicator).toHaveAttribute('role', 'status');
    // Has a textual label element alongside the color cue
    expect(indicator?.querySelector('.status-indicator__label')).toBeInTheDocument();
  });

  it('derives a fail status from a message_fail event', () => {
    const { container } = renderWithContext(
      <>
        <EmitEvents events={[{ type: 'message_fail', payload: 'WMF write failed' }]} />
        <StatusIndicator />
      </>
    );
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toHaveAttribute('data-status', 'fail');
  });

  it('derives a success status from a message_success event', () => {
    const { container } = renderWithContext(
      <>
        <EmitEvents events={[{ type: 'message_success', payload: 'ok' }]} />
        <StatusIndicator />
      </>
    );
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toHaveAttribute('data-status', 'success');
  });

  it('treats a reconnected event as success', () => {
    const { container } = renderWithContext(
      <>
        <EmitEvents events={[{ type: 'reconnected', payload: '/dev/ttyUSB0' }]} />
        <StatusIndicator />
      </>
    );
    const indicator = container.querySelector('.status-indicator');
    expect(indicator).toHaveAttribute('data-status', 'success');
  });
});
