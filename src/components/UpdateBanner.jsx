/**
 * UpdateBanner.jsx
 *
 * Shown when a new deploy is installed and waiting. Replaces the old
 * `registerType: 'autoUpdate'` behaviour, which took over the running page and
 * cleaned up the precache underneath it — breaking the next lazy tab load. See
 * the note in src/utils/swUpdate.js.
 *
 * It is deliberately `role="status"`, not `role="alert"`: nothing is wrong, and
 * it must not interrupt the three `role="alert"` banners above it (corruption,
 * save failure, replace failure), all of which are genuine problems.
 */
import { useSyncExternalStore } from 'react';
import {
  subscribeToUpdate,
  isUpdateReady,
  isUpdateApplying,
  applyUpdate,
  dismissUpdate,
} from '../utils/swUpdate';

export function UpdateBanner() {
  const ready = useSyncExternalStore(subscribeToUpdate, isUpdateReady, () => false);
  const applying = useSyncExternalStore(subscribeToUpdate, isUpdateApplying, () => false);

  if (!ready) return null;

  return (
    <div className="corruption-banner corruption-banner--update" role="status">
      <div className="corruption-banner-icon" aria-hidden="true">↻</div>
      <div className="corruption-banner-body">
        <div className="corruption-banner-title">A new version is ready</div>
        <div className="corruption-banner-message">
          Reload to pick it up. Your ledger is saved — nothing is lost either way.
        </div>
        <div className="corruption-banner-actions">
          <button
            className="corruption-banner-btn"
            disabled={applying}
            onClick={applyUpdate}
          >
            {applying ? 'Reloading…' : 'Reload'}
          </button>
          <button
            className="corruption-banner-btn corruption-banner-btn--ghost"
            disabled={applying}
            onClick={dismissUpdate}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
