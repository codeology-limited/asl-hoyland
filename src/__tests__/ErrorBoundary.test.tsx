import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import React from 'react';

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({
  shouldThrow = true,
  errorMessage = 'Test error'
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>No error</div>;
};

// Component that throws a string
const ThrowString: React.FC = () => {
  throw 'String error';
};

// Component that throws an object
const ThrowObject: React.FC = () => {
  throw { message: 'Object error' };
};

describe('ErrorBoundary', () => {
  // Suppress console.error for these tests since we expect errors
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders default fallback UI when an error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders custom fallback UI when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('calls onShowError callback with error message', () => {
    const onShowError = vi.fn();

    render(
      <ErrorBoundary onShowError={onShowError}>
        <ThrowError errorMessage="Custom error message" />
      </ErrorBoundary>
    );

    expect(onShowError).toHaveBeenCalledWith('Error: Custom error message');
  });

  it('handles string errors', () => {
    const onShowError = vi.fn();

    render(
      <ErrorBoundary onShowError={onShowError}>
        <ThrowString />
      </ErrorBoundary>
    );

    expect(onShowError).toHaveBeenCalledWith('Error: String error');
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('handles object errors by stringifying them', () => {
    const onShowError = vi.fn();

    render(
      <ErrorBoundary onShowError={onShowError}>
        <ThrowObject />
      </ErrorBoundary>
    );

    expect(onShowError).toHaveBeenCalled();
    expect(onShowError.mock.calls[0][0]).toContain('message');
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('resets error boundary when resetKeys change', () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={['key1']}>
        <ThrowError />
      </ErrorBoundary>
    );

    // Should show fallback
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();

    // Change resetKeys and render with no error
    rerender(
      <ErrorBoundary resetKeys={['key2']}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should reset and show children
    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('does not reset when resetKeys length changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={['key1']}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={['key1', 'key2']}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should reset because resetKeys array changed
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('does not reset when resetKeys are undefined', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should still show error (no reset)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});
