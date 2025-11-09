import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgramSelect, { ProgramOption } from '../ProgramSelect';

describe('CustomPrograms/ProgramSelect', () => {
  it('renders nothing when programNames is empty', () => {
    const { container } = render(
      <select>
        <ProgramSelect programOptions={[]} />
      </select>
    );
    const options = container.querySelectorAll('option');
    expect(options).toHaveLength(0);
  });

  it('renders nothing when programNames is null/undefined', () => {
    const { container } = render(
      <select>
        <ProgramSelect programOptions={null as any} />
      </select>
    );
    const options = container.querySelectorAll('option');
    expect(options).toHaveLength(0);
  });

  it('renders disabled "Choose Custom" option', () => {
    render(
      <select>
        <ProgramSelect programOptions={[{ name: 'Custom1', durationMinutes: 120 }]} />
      </select>
    );
    const chooseOption = screen.getByText(/Choose Custom/);
    expect(chooseOption).toBeInTheDocument();
    expect(chooseOption).toHaveAttribute('disabled');
  });

  it('renders all custom program names as options', () => {
    const programs: ProgramOption[] = [
      { name: 'MyProgram1', durationMinutes: 60 },
      { name: 'MyProgram2', durationMinutes: 30 },
      { name: 'MyProgram3', durationMinutes: 45 },
    ];
    render(
      <select>
        <ProgramSelect programOptions={programs} />
      </select>
    );

    programs.forEach(({ name, durationMinutes }) => {
      expect(screen.getByText(`${name} (${Math.round(durationMinutes)}m)`)).toBeInTheDocument();
    });
  });

  it('sets value attribute correctly for each option', () => {
    const programs: ProgramOption[] = [
      { name: 'custom1', durationMinutes: 15 },
      { name: 'custom2', durationMinutes: 20 },
    ];
    const { container } = render(
      <select>
        <ProgramSelect programOptions={programs} />
      </select>
    );

    const options = container.querySelectorAll('option');
    // +1 for the "Choose Custom" option
    expect(options).toHaveLength(programs.length + 1);

    expect(options[1]).toHaveAttribute('value', 'custom1');
    expect(options[2]).toHaveAttribute('value', 'custom2');
  });
});
