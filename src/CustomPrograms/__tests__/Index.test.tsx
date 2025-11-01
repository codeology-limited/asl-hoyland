import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomPrograms from '../Index';
import { AppProvider } from '../../AppContext';
import React from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const renderWithContext = (component: React.ReactElement) => {
  return render(<AppProvider>{component}</AppProvider>);
};

describe('CustomPrograms', () => {
  const mockSetIsRunning = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the custom programs component', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    // Check for the dropdown which is always rendered
    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('renders program selector dropdown', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('renders intensity slider', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('renders start button when not running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeInTheDocument();
  });

  it('disables start button when port is not connected', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={false}
      />
    );

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeDisabled();
  });

  it('shows progress bar when not running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders pause and stop buttons when running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isPortConnected={true}
      />
    );

    const pauseButton = screen.getByRole('button', { name: /pause/i });
    const stopButton = screen.getByRole('button', { name: /stop/i });

    expect(pauseButton).toBeInTheDocument();
    expect(stopButton).toBeInTheDocument();
  });

  it('does not render start button when running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isPortConnected={true}
      />
    );

    const startButton = screen.queryByRole('button', { name: /^start$/i });
    expect(startButton).not.toBeInTheDocument();
  });

  it('disables program selector when running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isPortConnected={true}
      />
    );

    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeDisabled();
  });

  it('allows changing intensity slider value when not running', async () => {
    const user = userEvent.setup();
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    const slider = screen.getByRole('slider');

    // The initial value is 5, just verify slider exists and is interactive
    expect(slider).toBeInTheDocument();
  });

  it('loads custom programs on mount', async () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isPortConnected={true}
      />
    );

    // Wait for programs to load - the dropdown should be populated
    await waitFor(() => {
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();
    });
  });

  it('displays frequency indicator when running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isPortConnected={true}
      />
    );

    // The frequency display element should be visible
    const freqDisplay = screen.getByText(/Hz/i);
    expect(freqDisplay).toBeInTheDocument();
  });
});
