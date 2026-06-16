/**
 * CorruptionBanner.jsx
 *
 * Dismissible top-of-page banner shown when loadState() detected an
 * unrecoverable save (parse failure or invalid shape) and fell back to the
 * initial state. Offers:
 *   - Download: save the corrupted raw string as a JSON file (the same raw
 *     that was just backed up to localStorage under
 *     `guards_ledger_corrupted_backup`).
 *   - Import JSON: trigger the existing import flow so the user can load a
 *     previously exported save.
 *   - Dismiss: hide the banner and clear the backed-up raw string.
 */
import { useRef } from 'react';

const REASON_LABEL = {
  'parse-failure':      'Your save file could not be parsed (the data is corrupted or truncated).',
  'invalid-shape':      'Your save file was parsed but its structure was unrecognizable.',
  'v1-parse-failure':   'An older-format save could not be parsed.',
  'v1-invalid-shape':   'An older-format save had an unrecognizable structure.',
};

function reasonText(reason) {
  return REASON_LABEL[reason] || 'Your save file could not be loaded.';
}

export function CorruptionBanner({ corruption, onDismiss, onImport }) {
  const fileRef = useRef(null);

  function handleDownload() {
    const payload = JSON.stringify({
      reason:      corruption.reason,
      raw:         corruption.raw,
      backedUpAt:  new Date().toISOString(),
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `guards-ledger-corrupted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = '';
  }

  return (
    <div className="corruption-banner" role="alert">
      <div className="corruption-banner-icon" aria-hidden="true">⚠</div>
      <div className="corruption-banner-body">
        <div className="corruption-banner-title">Save could not be loaded</div>
        <div className="corruption-banner-message">{reasonText(corruption.reason)}</div>
        <div className="corruption-banner-message">
          The raw save has been backed up to <code>guards_ledger_corrupted_backup</code> in your browser.
          You can download it, import a previously exported save, or start fresh.
        </div>
        <div className="corruption-banner-actions">
          <button className="corruption-banner-btn" onClick={handleDownload}>
            Download backup
          </button>
          <button className="corruption-banner-btn" onClick={handleImportClick}>
            Import save…
          </button>
          <button className="corruption-banner-btn corruption-banner-btn--ghost" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
