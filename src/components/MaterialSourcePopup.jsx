import { MATERIAL_SOURCES } from '../data/materials';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { MaterialSourceSections } from './MaterialSourceSections';

export function MaterialSourcePopup({ item, onClose }) {
  const sources = item ? MATERIAL_SOURCES[item] : null;
  const dialogRef = useDialogA11y(!!item, onClose);

  if (!item) return null;

  return (
    <div className="source-popup-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="source-popup"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Sources for ${item}`}
      >
        <div className="source-popup-handle" />

        <div className="source-popup-header">
          <span className="source-popup-title">{item}</span>
          <button className="source-popup-close" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        <div className="source-popup-body">
          <MaterialSourceSections sources={sources} />
        </div>
      </div>
    </div>
  );
}
