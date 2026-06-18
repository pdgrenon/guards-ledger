import { useDialogA11y } from '../hooks/useDialogA11y';

export function ConfirmModal({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel, danger }) {
  const dialogRef = useDialogA11y(true, onCancel);

  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="confirm-modal-handle" />
        <div className="confirm-modal-header">
          <span className="confirm-modal-title">{title}</span>
        </div>
        <div className="confirm-modal-body">
          {children}
        </div>
        <div className="confirm-modal-actions">
          <button className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onCancel}>
            {cancelLabel || 'Cancel'}
          </button>
          <button
            className={`confirm-modal-btn ${danger ? 'confirm-modal-btn--danger' : 'confirm-modal-btn--confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
