import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgramSelect, { ProgramOption } from '../ProgramSelect';

describe('DefaultPrograms/ProgramSelect', () => {
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

  it('renders disabled "Choose" option', () => {
    render(
      <select>
        <ProgramSelect
          programOptions={[{ name: 'Program1', durationMinutes: 45 }]}
        />
      </select>
    );
    const chooseOption = screen.getByText(/Choose/);
    expect(chooseOption).toBeInTheDocument();
    expect(chooseOption).toHaveAttribute('disabled');
  });

  it('renders all program names as options', () => {
    const programs: ProgramOption[] = [
      { name: 'Alpha', durationMinutes: 90 },
      { name: 'Beta', durationMinutes: 60 },
      { name: 'Gamma', durationMinutes: 30 },
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

  it('renders options in alphabetical order regardless of input order', () => {
    const programs: ProgramOption[] = [
      { name: 'Zebra', durationMinutes: 10 },
      { name: 'apple', durationMinutes: 20 },
      { name: 'Mango', durationMinutes: 30 },
    ];
    const { container } = render(
      <select>
        <ProgramSelect programOptions={programs} />
      </select>
    );

    // Skip the leading disabled "Choose" option
    const values = Array.from(container.querySelectorAll('option'))
      .slice(1)
      .map(o => o.getAttribute('value'));
    expect(values).toEqual(['apple', 'Mango', 'Zebra']);
  });

  it('sets value attribute correctly for each option', () => {
    const programs: ProgramOption[] = [
      { name: 'test1', durationMinutes: 10 },
      { name: 'test2', durationMinutes: 20 },
    ];
    const { container } = render(
      <select>
        <ProgramSelect programOptions={programs} />
      </select>
    );

    const options = container.querySelectorAll('option');
    // +1 for the "Choose" option
    expect(options).toHaveLength(programs.length + 1);

    expect(options[1]).toHaveAttribute('value', 'test1');
    expect(options[2]).toHaveAttribute('value', 'test2');
  });
});
