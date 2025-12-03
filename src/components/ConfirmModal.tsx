import React from 'react';

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

const ConfirmModal: React.FC<ConfirmModalProps> = ({ open, title, message, onYes, onNo }) => {
  if (!open) return null;
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {message ? <p>{message}</p> : null}
        <div style={btnRow}>
          <button style={{ ...btn, background: '#f5f5f5' }} onClick={onNo}>No</button>
          <button style={{ ...btn, background: '#e6ffe6', borderColor: '#9ad09a' }} onClick={onYes}>Yes</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

