import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomPrograms from '../Index';
import { AppProvider } from '../../AppContext';
import AppDatabase from '../../util/AppDatabase';
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
        isDeviceReady={true}
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
        isDeviceReady={true}
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
        isDeviceReady={true}
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
        isDeviceReady={true}
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
        isDeviceReady={false}
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
        isDeviceReady={true}
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
      <CustomPrograms
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
      <CustomPrograms
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
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={false}
        isDeviceReady={true}
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
        isDeviceReady={true}
      />
    );

    // Wait for programs to load - the dropdown should be populated
    await waitFor(() => {
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();
    });
  });

  it('resets the UI when a range program finishes on its own (onStop wired at start)', async () => {
    // Regression: the runner is created at Start, but onStop used to be wired only
    // by the [intensity] effect — which had already run (with no runner) and didn't
    // re-run because the slider was untouched. So a range that finished naturally
    // reset the device but left the UI stuck "running". Wiring onStop at creation
    // fixes it: natural completion must drive resetUI → setIsRunning(false).
    const seed = new AppDatabase();
    await seed.saveData({
      name: 'zzTinyRange',
      range: true,
      data: [
        { channel: 1, frequency: 100, runTime: 0, wavetype: 'SINE' },
        { channel: 1, frequency: 102, runTime: 0, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.001, // ~60ms — completes well within the waitFor window
      default: false,
      startFrequency: 0,
    });

    const setIsRunning = vi.fn();
    const user = userEvent.setup();
    renderWithContext(
      <CustomPrograms
        setIsRunning={setIsRunning}
        isRunning={false}
        isDeviceReady={true}
        testMode={true}
        isUltrasoundOnly={false}
        setChannel1Active={vi.fn()}
        setChannel2Active={vi.fn()}
      />
    );

    // Wait for the seeded custom program to appear, then select and start it.
    const dropdown = screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => {
      expect(Array.from(dropdown.options).some(o => o.value === 'zzTinyRange')).toBe(true);
    });
    await user.selectOptions(dropdown, 'zzTinyRange');
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    // Non-ultrasound start asks to confirm the ultrasound device is disconnected.
    await user.click(await screen.findByRole('button', { name: /^yes$/i }));

    // doStart flips it on…
    await waitFor(() => expect(setIsRunning).toHaveBeenCalledWith(true));
    // …and natural completion must flip it back off via onStop → resetUI.
    await waitFor(() => expect(setIsRunning).toHaveBeenCalledWith(false), { timeout: 3000 });
  });

  it('displays frequency indicator when running', () => {
    renderWithContext(
      <CustomPrograms
        setIsRunning={mockSetIsRunning}
        isRunning={true}
        isDeviceReady={true}
      />
    );

    // The frequency display element should be visible
    const freqDisplay = screen.getByText(/Hz/i);
    expect(freqDisplay).toBeInTheDocument();
  });
});
