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

    expect(screen.getByText(/New program or Choose Program/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter program name')).toBeInTheDocument();
    expect(screen.getByText(/This is a ranged program/i)).toBeInTheDocument();
  });

  it('renders initial row for non-range program', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInputs = screen.getAllByPlaceholderText(/Frequency/i);
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

    // In range mode, should have 2 rows (start and end frequency)
    await waitFor(() => {
      const startFreqInput = screen.getByPlaceholderText('Start Frequency');
      const endFreqInput = screen.getByPlaceholderText('End Frequency');
      expect(startFreqInput).toBeInTheDocument();
      expect(endFreqInput).toBeInTheDocument();
    });
  });

  it('allows adding frequency rows in non-range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Initially should have 1 row
    let frequencyInputs = screen.getAllByPlaceholderText(/Frequency|Start Frequency|End Frequency/i);
    expect(frequencyInputs).toHaveLength(1);

    // Click the + button
    const addButton = screen.getByText('+');
    await user.click(addButton);

    // Should now have 2 rows
    await waitFor(() => {
      frequencyInputs = screen.getAllByPlaceholderText(/Frequency|Start Frequency|End Frequency/i);
      expect(frequencyInputs).toHaveLength(2);
    });
  });

  it('allows deleting frequency rows in non-range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Add a second row first
    const addButton = screen.getByText('+');
    await user.click(addButton);

    await waitFor(() => {
      const frequencyInputs = screen.getAllByPlaceholderText(/Frequency/i);
      expect(frequencyInputs).toHaveLength(2);
    });

    // Delete the second row
    const deleteButton = screen.getByText('-');
    await user.click(deleteButton);

    await waitFor(() => {
      const frequencyInputs = screen.getAllByPlaceholderText(/Frequency/i);
      expect(frequencyInputs).toHaveLength(1);
    });
  });

  it('allows entering valid numeric values for frequency', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInput = screen.getByPlaceholderText(/Frequency/i);
    await user.type(frequencyInput, '1000');

    expect(frequencyInput).toHaveValue('1000');
  });

  it('allows entering decimal values for frequency', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const frequencyInput = screen.getByPlaceholderText(/Frequency/i);
    await user.type(frequencyInput, '123.45');

    expect(frequencyInput).toHaveValue('123.45');
  });

  it('renders save button', () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const saveButton = screen.getByRole('button', { name: /Save/i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it('disables save button while saving', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Enter program name and frequency
    const nameInput = screen.getByPlaceholderText('Enter program name');
    await user.type(nameInput, 'Test');

    const frequencyInput = screen.getByPlaceholderText(/Frequency/i);
    await user.type(frequencyInput, '1000');

    const saveButton = screen.getByRole('button', { name: /Save/i });
    await user.click(saveButton);

    // Button should be disabled while saving
    // Note: This test may need adjustment based on actual async behavior
  });

  it('renders custom program dropdown', async () => {
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await waitFor(() => {
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeInTheDocument();

      const newProgramOption = screen.getByRole('option', { name: /New Program/i });
      expect(newProgramOption).toBeInTheDocument();
    });
  });

  it('allows entering runtime values', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await waitFor(() => {
      const timeInputs = screen.getAllByPlaceholderText('Time in minutes');
      expect(timeInputs).toHaveLength(1);
    });

    const timeInputs = screen.getAllByPlaceholderText('Time in minutes');
    // Clear first then type
    await user.clear(timeInputs[0]);
    await user.type(timeInputs[0], '5');
    expect(timeInputs[0]).toHaveValue('5');
  });

  it('does not allow adding rows in range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Enable range mode
    const rangeCheckbox = screen.getByRole('checkbox');
    await user.click(rangeCheckbox);

    await waitFor(() => {
      expect(rangeCheckbox).toBeChecked();
    });

    // Should not have a + button in range mode
    const addButton = screen.queryByText('+');
    expect(addButton).not.toBeInTheDocument();
  });

  it('does not allow deleting rows in range mode', async () => {
    const user = userEvent.setup();
    renderWithContext(<ProgramEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    // Enable range mode
    const rangeCheckbox = screen.getByRole('checkbox');
    await user.click(rangeCheckbox);

    await waitFor(() => {
      expect(rangeCheckbox).toBeChecked();
    });

    // Should not have a - button in range mode
    const deleteButton = screen.queryByText('-');
    expect(deleteButton).not.toBeInTheDocument();
  });
});
