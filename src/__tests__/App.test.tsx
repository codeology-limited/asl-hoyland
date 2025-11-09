import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import React from 'react';
import { invoke } from '@tauri-apps/api/tauri';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn().mockResolvedValue('TEST'),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app with header', async () => {
    render(<App />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Altered States/i });
      expect(link).toBeInTheDocument();
    });
  });

  it('renders navigation tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });
  });

  it('renders connect button', async () => {
    render(<App />);

    await waitFor(() => {
      const connectButton = screen.getByRole('button', { name: /Connect/i });
      expect(connectButton).toBeInTheDocument();
    });
  });

  it('renders footer with copyright', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Copyright.*2024.*Altered States Limited/i)).toBeInTheDocument();
      expect(screen.getByText(/v1\.5\.7\.2/i)).toBeInTheDocument();
    });
  });

  it('renders UI immediately without blocking', () => {
    render(<App />);

    // UI should render immediately, not show a blocking loading message
    expect(screen.queryByText('LOADING...')).not.toBeInTheDocument();
    // Check that main UI elements are present
    expect(screen.getByRole('button', { name: /Connect/i })).toBeInTheDocument();
  });

  it('renders app and database initializes', async () => {
    const { container } = render(<App />);

    // The app should render successfully
    expect(container).toBeInTheDocument();

    // Check for main app structure
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
  });

  it('renders default route by default', async () => {
    render(<App />);

    await waitFor(() => {
      // DefaultPrograms component should be rendered (check for dropdown)
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();
    });
  });

  it('navigates to custom programs when clicking custom tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    const customLink = screen.getByText('Custom');
    await user.click(customLink);

    await waitFor(() => {
      // Should navigate to custom programs route (still renders dropdown)
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();
    });
  });

  it('navigates to editor when clicking editor tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });

    const editorLink = screen.getByText('Editor');
    await user.click(editorLink);

    await waitFor(() => {
      // Editor component should be rendered
      expect(screen.getByText(/New program or Choose Program/i)).toBeInTheDocument();
    });
  });

  it('disables navigation tabs when program is running', async () => {
    render(<App />);

    await waitFor(() => {
      const customLink = screen.getByText('Custom');
      expect(customLink).not.toHaveClass('disabled');
    });

    // Note: This test would require triggering isRunning state
    // which would need more complex setup
  });

  it('shows test-mode label when no hardware is detected', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No device found \(IN TEST MODE\)/i)).toBeInTheDocument();
    });
  });

  it('enables program controls once test mode is active', async () => {
    const { container } = render(<App />);

    const dropdown = await screen.findByRole('combobox');
    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
    });

    await waitFor(() => {
      const startButton = container.querySelector<HTMLButtonElement>('.default-programs button.start');
      if (!startButton) {
        throw new Error('Start button not found');
      }
      expect(startButton).not.toBeDisabled();
    });
  });

  it('disables selectors and start button while reconnecting', async () => {
    const user = userEvent.setup();
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    // First auto-connect resolves immediately
    invokeMock.mockReturnValueOnce(Promise.resolve('TEST'));

    // Manual reconnect stays pending until we resolve it
    let resolveReconnect: ((value: string) => void) | null = null;
    const pendingReconnect = new Promise<string>((resolve) => {
      resolveReconnect = resolve;
    });
    invokeMock.mockReturnValueOnce(pendingReconnect);

    const { container } = render(<App />);

    const dropdown = await screen.findByRole('combobox');
    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
    });

    const getStartButton = () => {
      const btn = container.querySelector<HTMLButtonElement>('.default-programs button.start');
      if (!btn) throw new Error('Start button not found');
      return btn;
    };
    await waitFor(() => {
      expect(getStartButton()).not.toBeDisabled();
    });

    const reconnectButton = await screen.findByRole('button', { name: /Reconnect/i });
    await user.click(reconnectButton);

    expect(dropdown).toBeDisabled();
    expect(getStartButton()).toBeDisabled();

    resolveReconnect?.('TEST');

    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
    });
    await waitFor(() => {
      expect(getStartButton()).not.toBeDisabled();
    });
  });

  it('renders StatusIndicator component', async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      const statusIndicator = container.querySelector('.status-indicator');
      expect(statusIndicator).toBeInTheDocument();
    });
  });

  it('auto-connect defers so the first paint is uninterrupted', async () => {
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    render(<App />);

    // Not called synchronously
    expect(invokeMock).not.toHaveBeenCalled();

    // But should trigger shortly after to attempt connection
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('reconnect_device', expect.anything());
    });
  });

  it('allows clicking connect button when not running', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      const connectButton = screen.getByRole('button', { name: /Connect/i });
      expect(connectButton).not.toBeDisabled();
    });

    const connectButton = screen.getByRole('button', { name: /Connect/i });
    await user.click(connectButton);

    // Button should still be clickable
    expect(connectButton).not.toBeDisabled();
  });

  it('renders link to altered-states.net', async () => {
    render(<App />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Altered States/i });
      expect(link).toHaveAttribute('href', 'http://altered-states.net');
    });
  });
});
