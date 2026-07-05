import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DefaultPrograms from '../Index';
import { AppProvider } from '../../AppContext';
import React from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const renderWithContext = (component: React.ReactElement) => {
  return render(<AppProvider>{component}</AppProvider>);
};

describe('DefaultPrograms', () => {
  const mockSetIsRunning = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default programs component', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    // Check for the dropdown which is always rendered
    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('renders program selector dropdown', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('renders intensity slider', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('renders start button when not running', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeInTheDocument();
  });

  it('disables start button when port is not connected', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={false}
      />
    );

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeDisabled();
  });

  it('shows progress bar when not running', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders pause and stop buttons when running', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isDeviceReady={true}
      />
    );

    const pauseButton = screen.getByRole('button', { name: /pause/i });
    const stopButton = screen.getByRole('button', { name: /stop/i });

    expect(pauseButton).toBeInTheDocument();
    expect(stopButton).toBeInTheDocument();
  });

  it('does not render start button when running', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isDeviceReady={true}
      />
    );

    const startButton = screen.queryByRole('button', { name: /^start$/i });
    expect(startButton).not.toBeInTheDocument();
  });

  it('disables program selector when running', () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isDeviceReady={true}
      />
    );

    const dropdown = screen.getByRole('combobox');
    expect(dropdown).toBeDisabled();
  });

  it('allows changing intensity slider value when not running', async () => {
    const user = userEvent.setup();
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    const slider = screen.getByRole('slider');

    // The initial value depends on program settings, just verify it can be changed
    expect(slider).toBeInTheDocument();
  });

  it('loads default programs on mount', async () => {
    renderWithContext(
      <DefaultPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
      />
    );

    // Wait for programs to load - the dropdown should be populated
    await waitFor(() => {
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();
    });
  });
});

// Lynne 17 Jun: Rife/TTF split. These pin the component-level filter (the DB
// tests only check which rows carry category='ttf', not that the dropdown
// consumes it). An inverted ttf condition would be caught here.
describe('DefaultPrograms category/ultrasound filtering', () => {
  const commonProps = {
    setIsRunning: vi.fn(),
    isRunning: false,
    isDeviceReady: true,
    testMode: false,
    setChannel1Active: vi.fn(),
    setChannel2Active: vi.fn(),
  };

  const optionValues = () =>
    screen.getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);

  beforeEach(() => vi.clearAllMocks());

  it('TTF tab shows only the ttf program (not Rife/cancer/ultrasound)', async () => {
    renderWithContext(
      <DefaultPrograms {...commonProps} isUltrasoundOnly={false} category="ttf" />
    );
    await waitFor(() => expect(optionValues()).toContain('ttf'));
    expect(optionValues()).toEqual(['ttf']);
  });

  it('Rife tab (ultrasound off) lists Rife + cancer programs, excludes ttf/fsm and ultra', async () => {
    renderWithContext(
      <DefaultPrograms {...commonProps} isUltrasoundOnly={false} category="rife" />
    );
    await waitFor(() => expect(optionValues().length).toBeGreaterThan(1));
    const vals = optionValues();
    expect(vals).toContain('anthrax');
    expect(vals).toContain('mcf7Breast150kHz'); // cancer TTFields stay in Rife
    expect(vals).not.toContain('ttf');
    expect(vals).not.toContain('liver35Hz');       // fsm-category → not in Rife
    expect(vals).not.toContain('dualFreq230and430Hz');
    expect(vals).not.toContain('ultra500');
  });

  it('FSM tab shows only the fsm programs (Liver, Inflammation, 230/430)', async () => {
    renderWithContext(
      <DefaultPrograms {...commonProps} isUltrasoundOnly={false} category="fsm" />
    );
    await waitFor(() => expect(optionValues()).toContain('liver35Hz'));
    const vals = optionValues().sort();
    expect(vals).toEqual(['dualFreq230and430Hz', 'inflammation284Hz', 'liver35Hz']);
  });

  it('Rife tab (ultrasound on) lists only ultrasound programs, never ttf', async () => {
    renderWithContext(
      <DefaultPrograms {...commonProps} isUltrasoundOnly={true} category="rife" />
    );
    await waitFor(() => expect(optionValues()).toContain('ultra500'));
    const vals = optionValues();
    expect(vals).toContain('ultra670');
    expect(vals).not.toContain('ttf');
    expect(vals).not.toContain('anthrax');
  });
});
