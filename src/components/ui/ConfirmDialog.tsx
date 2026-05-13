import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title, message, confirmText = '确认', cancelText = '取消',
  danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return createPortal(
    <div className="modalBackdrop" onClick={onCancel}>
      <div
        className="formCard modalCard"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="formCard__head">
          <div className="formCard__id" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {danger && <AlertTriangle size={14} style={{ color: 'var(--err)' }} />}
            <span>{danger ? 'CONFIRM.DANGER' : 'CONFIRM'} · {title}</span>
          </div>
          <button type="button" className="iconBtn iconBtn--ghost" onClick={onCancel}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '20px 22px', color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.6 }}>
          {message}
        </div>

        <div className="formCard__foot">
          <div />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btnGhost" onClick={onCancel}>{cancelText}</button>
            {danger ? (
              <button type="button" className="btnLock" onClick={onConfirm}>{confirmText}</button>
            ) : (
              <button type="button" className="btnPrimary btnPrimary--sm" onClick={onConfirm}>{confirmText}</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
