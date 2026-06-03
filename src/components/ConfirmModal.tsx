import React, { useCallback, useEffect, useRef } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  onYes: () => void;
  onNo: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const boxStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 6,
  minWidth: 420,
  maxWidth: 560,
  padding: '24px 28px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  textAlign: 'center',
};

const btnRow: React.CSSProperties = {
  marginTop: 20,
  display: 'flex',
  gap: 16,
  justifyContent: 'center',
};

const btn: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 4,
  border: '1px solid #ccc',
  cursor: 'pointer',
  fontWeight: 600,
};

// Stable id for aria-labelledby (the dialog title heading).
const TITLE_ID = 'confirm-modal-title';

const ConfirmModal: React.FC<ConfirmModalProps> = ({ open, title, message, onYes, onNo }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // The "No" / cancel button is the safe default focus target for a
  // safety-critical confirmation (Yes starts output on a human body).
  const noButtonRef = useRef<HTMLButtonElement | null>(null);
  // Remember whatever had focus before the modal opened so we can restore it.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management on open: stash the previous focus, then autofocus "No".
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    // Defer to ensure the dialog is mounted before focusing.
    noButtonRef.current?.focus();
    return () => {
      // Restore focus to the element that opened the modal.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  // Escape cancels (onNo); Tab is trapped within the dialog.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onNo();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onNo]
  );

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      // Clicking the dimmed overlay (outside the dialog box) cancels.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onNo();
      }}
    >
      <div
        ref={dialogRef}
        style={boxStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={handleKeyDown}
      >
        <h2 id={TITLE_ID} style={{ marginTop: 0 }}>{title}</h2>
        {message ? <p>{message}</p> : null}
        <div style={btnRow}>
          <button ref={noButtonRef} style={{ ...btn, background: '#f5f5f5' }} onClick={onNo}>No</button>
          <button style={{ ...btn, background: '#e6ffe6', borderColor: '#9ad09a' }} onClick={onYes}>Yes</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
