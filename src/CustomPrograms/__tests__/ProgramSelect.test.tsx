import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgramSelect from '../ProgramSelect';

describe('CustomPrograms/ProgramSelect', () => {
  it('renders nothing when programNames is empty', () => {
    const { container } = render(
      <select>
        <ProgramSelect programNames={[]} />
      </select>
    );
    const options = container.querySelectorAll('option');
    expect(options).toHaveLength(0);
  });

  it('renders nothing when programNames is null/undefined', () => {
    const { container } = render(
      <select>
        <ProgramSelect programNames={null as any} />
      </select>
    );
    const options = container.querySelectorAll('option');
    expect(options).toHaveLength(0);
  });

  it('renders disabled "Choose Custom" option', () => {
    render(
      <select>
        <ProgramSelect programNames={['Custom1']} />
      </select>
    );
    const chooseOption = screen.getByText(/Choose Custom/);
    expect(chooseOption).toBeInTheDocument();
    expect(chooseOption).toHaveAttribute('disabled');
  });

  it('renders all custom program names as options', () => {
    const programs = ['MyProgram1', 'MyProgram2', 'MyProgram3'];
    render(
      <select>
        <ProgramSelect programNames={programs} />
      </select>
    );

    programs.forEach(name => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('sets value attribute correctly for each option', () => {
    const programs = ['custom1', 'custom2'];
    const { container } = render(
      <select>
        <ProgramSelect programNames={programs} />
      </select>
    );

    const options = container.querySelectorAll('option');
    // +1 for the "Choose Custom" option
    expect(options).toHaveLength(programs.length + 1);

    expect(options[1]).toHaveAttribute('value', 'custom1');
    expect(options[2]).toHaveAttribute('value', 'custom2');
  });
});
