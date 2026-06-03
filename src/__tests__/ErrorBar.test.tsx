import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBar from '../ErrorBar';

describe('ErrorBar', () => {
  it('renders nothing when messages array is empty', () => {
    const { container } = render(<ErrorBar messages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single error message', () => {
    render(<ErrorBar messages={['Error: Connection failed']} />);
    expect(screen.getByText('Error: Connection failed')).toBeInTheDocument();
  });

  it('renders multiple error messages as a list', () => {
    const messages = [
      'Error: Connection failed',
      'Warning: Invalid input',
      'Error: Timeout occurred',
    ];
    render(<ErrorBar messages={messages} />);

    messages.forEach(msg => {
      expect(screen.getByText(msg)).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });

  it('renders error-bar container with ul element', () => {
    render(<ErrorBar messages={['Test error']} />);
    const container = screen.getByRole('list').parentElement;
    expect(container).toHaveClass('error-bar');
  });

  it('exposes the error-bar as an assertive alert region for accessibility', () => {
    render(<ErrorBar messages={['Test error']} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('error-bar');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
