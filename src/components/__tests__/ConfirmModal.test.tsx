import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from '../ConfirmModal';
import React from 'react';

describe('ConfirmModal', () => {
  const onYes = vi.fn();
  const onNo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmModal open={false} title="Confirm" onYes={onYes} onNo={onNo} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title and both buttons when open', () => {
    render(<ConfirmModal open={true} title="Start program?" onYes={onYes} onNo={onNo} />);
    expect(screen.getByRole('heading', { name: 'Start program?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('exposes the dialog with aria-labelledby pointing at the title', () => {
    render(<ConfirmModal open={true} title="My Title" onYes={onYes} onNo={onNo} />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'My Title' });
    expect(heading).toHaveAttribute('id', labelledBy);
  });

  it('autofocuses the No (safe default) button on open', () => {
    render(<ConfirmModal open={true} title="Confirm" onYes={onYes} onNo={onNo} />);
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus();
  });

  it('calls onYes when Yes is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal open={true} title="Confirm" onYes={onYes} onNo={onNo} />);
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onNo).not.toHaveBeenCalled();
  });

  it('calls onNo when No is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal open={true} title="Confirm" onYes={onYes} onNo={onNo} />);
    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(onNo).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
  });

  it('calls onNo when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal open={true} title="Confirm" onYes={onYes} onNo={onNo} />);
    await user.keyboard('{Escape}');
    expect(onNo).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
  });

  it('calls onNo when clicking the overlay outside the dialog', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal open={true} title="Confirm" onYes={onYes} onNo={onNo} />);
    const dialog = screen.getByRole('dialog');
    // The overlay is the dialog's parent element.
    const overlay = dialog.parentElement as HTMLElement;
    await user.click(overlay);
    expect(onNo).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
  });

  it('does not cancel when clicking inside the dialog box', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal open={true} title="Confirm" message="body" onYes={onYes} onNo={onNo} />);
    await user.click(screen.getByText('body'));
    expect(onNo).not.toHaveBeenCalled();
    expect(onYes).not.toHaveBeenCalled();
  });
});
