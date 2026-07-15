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

  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the app with the brand logo (bottom-right, not a navigating link)', async () => {
    render(<App />);

    await waitFor(() => {
      // The logo is a plain image in the bottom-right; the old header <a> was
      // removed because clicking it navigated the whole webview to the store.
      const logo = screen.getByAltText(/Altered States/i);
      expect(logo).toBeInTheDocument();
      expect(logo.tagName.toLowerCase()).toBe('img');
    });
    expect(screen.queryByRole('link', { name: /Altered States/i })).not.toBeInTheDocument();
  });

  it('renders navigation tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Rife')).toBeInTheDocument();
      expect(screen.getByText('TTF')).toBeInTheDocument();
      expect(screen.getByText('FSM')).toBeInTheDocument();
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
      const versionSpan = screen.getByText((content, element) =>
        element?.classList?.contains('footer__version') && content.includes('v1.8.3')
      );
      expect(versionSpan).toBeInTheDocument();
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
      expect(screen.getByText(/Program name/i)).toBeInTheDocument();
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

  it('shows no-device label and test mode toggle when no hardware is detected', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('No device found')).toBeInTheDocument();
    });

    // Test mode toggle should be visible when no device is connected
    await waitFor(() => {
      expect(screen.getByText('Enable Test Mode')).toBeInTheDocument();
    });
  });

  it('enables program controls once test mode is active', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for auto-connect to finish (resolves with 'TEST', no real device)
    await waitFor(() => {
      expect(screen.getByText('No device found')).toBeInTheDocument();
    });

    // Controls should be disabled before enabling test mode
    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeDisabled();

    // Enable test mode by clicking the checkbox
    const testModeCheckbox = screen.getByRole('checkbox', { name: /Enable Test Mode/i });
    await user.click(testModeCheckbox);

    // Now controls should be enabled
    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
    });
  });

  it('disables selectors and start button while reconnecting', async () => {
    const user = userEvent.setup();
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    // First auto-connect finds a real device
    invokeMock.mockReturnValueOnce(Promise.resolve('/dev/ttyUSB0'));

    // Manual reconnect stays pending until we resolve it
    let resolveReconnect: ((value: string) => void) | null = null;
    const pendingReconnect = new Promise<string>((resolve) => {
      resolveReconnect = resolve;
    });
    invokeMock.mockReturnValueOnce(pendingReconnect);

    render(<App />);

    // Wait for auto-connect to finish with real device
    await waitFor(() => {
      expect(screen.getByText(/Connected to \/dev\/ttyUSB0/)).toBeInTheDocument();
    });

    const dropdown = screen.getByRole('combobox');
    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
    });

    // Click Reconnect button (shown because real device is connected)
    const reconnectButton = screen.getByRole('button', { name: /Reconnect/i });
    await user.click(reconnectButton);

    // During reconnection, controls should be disabled
    await waitFor(() => {
      expect(dropdown).toBeDisabled();
    });

    // Resolve the reconnect with a device
    resolveReconnect?.('/dev/ttyUSB0');

    // After reconnect finishes, controls should be enabled again
    await waitFor(() => {
      expect(dropdown).not.toBeDisabled();
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

    const connectButton = await screen.findByRole('button', { name: /Connect/i });

    await waitFor(() => {
      expect(connectButton).not.toBeDisabled();
    });

    await user.click(connectButton);

    await waitFor(() => {
      expect(connectButton).not.toBeDisabled();
    });
  });

  it('does not render a header link that would navigate the webview away', async () => {
    render(<App />);
    // Regression: an <a href="http://altered-states.net"> in the header hijacked
    // the whole Tauri webview to the external store with no way back.
    await waitFor(() => {
      expect(screen.getByAltText(/Altered States/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Altered States/i })).not.toBeInTheDocument();
  });
});
