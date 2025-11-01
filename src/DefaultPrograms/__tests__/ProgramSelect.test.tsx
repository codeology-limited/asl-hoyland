import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgramSelect from '../ProgramSelect';

describe('DefaultPrograms/ProgramSelect', () => {
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

  it('renders disabled "Choose" option', () => {
    render(
      <select>
        <ProgramSelect programNames={['Program1']} />
      </select>
    );
    const chooseOption = screen.getByText(/Choose/);
    expect(chooseOption).toBeInTheDocument();
    expect(chooseOption).toHaveAttribute('disabled');
  });

  it('renders all program names as options', () => {
    const programs = ['Alpha', 'Beta', 'Gamma'];
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
    const programs = ['test1', 'test2'];
    const { container } = render(
      <select>
        <ProgramSelect programNames={programs} />
      </select>
    );

    const options = container.querySelectorAll('option');
    // +1 for the "Choose" option
    expect(options).toHaveLength(programs.length + 1);

    expect(options[1]).toHaveAttribute('value', 'test1');
    expect(options[2]).toHaveAttribute('value', 'test2');
  });
});
