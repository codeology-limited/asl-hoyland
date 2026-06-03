import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgramEditor from '../index';
import { AppProvider } from '../../AppContext';
import React from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

const renderWithContext = (component: React.ReactElement) => {
  return render(<AppProvider>{component}</AppProvider>);
};

describe('ProgramEditor', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the program editor', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByText(/Load a saved program/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter program name')).toBeInTheDocument();
    expect(screen.getByText(/Ranged sweep program/i)).toBeInTheDocument();
  });

  it('renders initial row for non-range program', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInputs = screen.getAllByPlaceholderText(/^Frequency$/i);
    expect(frequencyInputs).toHaveLength(1);
  });

  it('allows user to enter program name', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const nameInput = screen.getByPlaceholderText('Enter program name');
    await user.type(nameInput, 'My Test Program');

    expect(nameInput).toHaveValue('My Test Program');
  });

  it('switches to range mode when checkbox is checked', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const rangeCheckbox = screen.getByRole('checkbox');
    expect(rangeCheckbox).not.toBeChecked();

    await user.click(rangeCheckbox);

    await waitFor(() => {
      expect(rangeCheckbox).toBeChecked();
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start Frequency')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('End Frequency')).toBeInTheDocument();
    });
  });

  it('allows adding frequency rows in non-range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getAllByPlaceholderText(/^Frequency$/i)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /add frequency/i }));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/^Frequency$/i)).toHaveLength(2);
    });
  });

  it('allows deleting frequency rows in non-range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('button', { name: /add frequency/i }));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/^Frequency$/i)).toHaveLength(2);
    });

    const removeButtons = screen.getAllByRole('button', { name: /remove step/i });
    await user.click(removeButtons[removeButtons.length - 1]!);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/^Frequency$/i)).toHaveLength(1);
    });
  });

  it('reorders rows with the move-down control', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Row 1 = 100, Row 2 = 200
    await user.type(screen.getAllByPlaceholderText(/^Frequency$/i)[0]!, '100');
    await user.click(screen.getByRole('button', { name: /add frequency/i }));
    await waitFor(() => expect(screen.getAllByPlaceholderText(/^Frequency$/i)).toHaveLength(2));
    await user.type(screen.getAllByPlaceholderText(/^Frequency$/i)[1]!, '200');

    // Move row 1 down -> order becomes 200, 100
    await user.click(screen.getByRole('button', { name: /move step 1 down/i }));

    await waitFor(() => {
      const freqs = screen.getAllByPlaceholderText(/^Frequency$/i) as HTMLInputElement[];
      expect(freqs[0]!.value).toBe('200');
      expect(freqs[1]!.value).toBe('100');
    });
  });

  it('allows entering valid numeric values for frequency', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInput = screen.getByPlaceholderText(/^Frequency$/i);
    await user.type(frequencyInput, '1000');

    expect(frequencyInput).toHaveValue('1000');
  });

  it('allows entering decimal values for frequency', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInput = screen.getByPlaceholderText(/^Frequency$/i);
    await user.type(frequencyInput, '123.45');

    expect(frequencyInput).toHaveValue('123.45');
  });

  it('renders save button', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const saveButton = screen.getByRole('button', { name: /save program/i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it('renders custom program dropdown', async () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await waitFor(() => {
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();

      const newProgramOption = screen.getByRole('option', { name: /New program/i });
      expect(newProgramOption).toBeInTheDocument();
    });
  });

  it('allows entering runtime values', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const timeInputs = screen.getAllByPlaceholderText('Time in minutes');
    expect(timeInputs).toHaveLength(1);

    await user.clear(timeInputs[0]!);
    await user.type(timeInputs[0]!, '5');
    expect(timeInputs[0]).toHaveValue('5');
  });

  it('shows a live total run-time summary', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText(/^Frequency$/i), '1000');
    await user.type(screen.getByPlaceholderText('Time in minutes'), '2');

    expect(screen.getByTestId('editor-summary')).toHaveTextContent(/2 min/);
    expect(screen.getByTestId('editor-summary')).toHaveTextContent(/1 frequency/i);
  });

  it('does not allow adding rows in range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());

    expect(screen.queryByRole('button', { name: /add frequency/i })).not.toBeInTheDocument();
  });

  it('does not allow deleting rows in range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());

    expect(screen.queryByRole('button', { name: /remove step/i })).not.toBeInTheDocument();
  });

  it('rejects saving with no program name and shows an inline error', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/program name/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('rejects saving when frequency is empty and shows an inline error', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'Test');
    const timeInput = screen.getByPlaceholderText('Time in minutes');
    await user.clear(timeInput);
    await user.type(timeInput, '5');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/frequency must be a positive number/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('rejects saving when runtime is zero and shows an inline error', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'Test');
    await user.type(screen.getByPlaceholderText(/^Frequency$/i), '1000');
    const timeInput = screen.getByPlaceholderText('Time in minutes');
    await user.clear(timeInput);
    await user.type(timeInput, '0');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('rejects frequencies above the device cap', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'Test');
    await user.type(screen.getByPlaceholderText(/^Frequency$/i), '10000000');
    const timeInput = screen.getByPlaceholderText('Time in minutes');
    await user.clear(timeInput);
    await user.type(timeInput, '5');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/must not exceed/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('rejects a range program whose start equals its end', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'Sweep');
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());

    await user.type(screen.getByPlaceholderText('Start Frequency'), '500');
    await user.type(screen.getByPlaceholderText('End Frequency'), '500');
    const timeInput = screen.getAllByPlaceholderText('Time in minutes')[0]!;
    await user.clear(timeInput);
    await user.type(timeInput, '10');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/must be different/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('renders an optional sweep-to input for non-range rows', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByPlaceholderText('Sweep to Hz')).toBeInTheDocument();
  });

  it('hides the sweep-to input in range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());

    expect(screen.queryByPlaceholderText('Sweep to Hz')).not.toBeInTheDocument();
  });

  it('rejects a non-positive sweep-to value', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'Test');
    await user.type(screen.getByPlaceholderText(/^Frequency$/i), '1000');
    const timeInput = screen.getByPlaceholderText('Time in minutes');
    await user.clear(timeInput);
    await user.type(timeInput, '5');
    await user.type(screen.getByPlaceholderText('Sweep to Hz'), '0');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/sweep-to frequency must be a positive number/i);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('saves a valid program and shows inline success', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByPlaceholderText('Enter program name'), 'EditorSaveTest');
    await user.type(screen.getByPlaceholderText(/^Frequency$/i), '1000');
    const timeInput = screen.getByPlaceholderText('Time in minutes');
    await user.clear(timeInput);
    await user.type(timeInput, '2');

    await user.click(screen.getByRole('button', { name: /save program/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Saved/i);
    });
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('does not render the misleading drag handle', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.queryByText('|||')).not.toBeInTheDocument();
  });
});
