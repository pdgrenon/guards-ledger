/**
 * swUpdate.js
 *
 * One-way bridge between the service-worker registration (main.jsx, which is
 * the only module that may import `virtual:pwa-register`) and the update
 * banner in App.
 *
 * The indirection exists for two reasons:
 *
 *  - `virtual:pwa-register` is a Vite virtual module. Vitest cannot resolve it,
 *    so any component that imported it directly would be untestable. main.jsx
 *    is never imported by a test, so the virtual import stays confined there.
 *  - The service worker can report a waiting update *before* React mounts. A
 *    plain event would be missed; this module holds the state, so a late
 *    subscriber still sees it (`isUpdateReady` is read on every render via
 *    `useSyncExternalStore`).
 *
 * Why an update needs a prompt at all — the AVE-292 lazy tabs. The app used to
 * build with `registerType: 'autoUpdate'`, which emits `skipWaiting()` +
 * `clientsClaim()` + `cleanupOutdatedCaches()`. A new deploy therefore took
 * over the *already-running* page and deleted the precache underneath it, so
 * the next tap on a lazily-loaded tab requested a chunk hash that no longer
 * existed in the precache *or* on the origin (Cloudflare Pages serves only the
 * current deployment) and died with "Failed to fetch dynamically imported
 * module". Only the five `lazy()` surfaces could fail this way; Guards, Cities
 * and Stash live in the entry chunk that had already downloaded — which is
 * exactly the reported symptom. Leaving the old worker in control until the
 * player accepts keeps the old chunks reachable for the whole session.
 */

// Set by reportUpdateReady; calling it activates the waiting worker and
// reloads. Null means "no update waiting".
let applyFn = null;
// Latched once the player accepts, so a second tap before the reload lands
// cannot send SKIP_WAITING twice.
let applying = false;
const listeners = new Set();

function emit() {
  // Copy first: a listener may unsubscribe during the walk.
  for (const listener of [...listeners]) listener();
}

/**
 * Called by main.jsx when the service worker reports a waiting update.
 * `apply` should activate it and reload the page.
 */
export function reportUpdateReady(apply) {
  if (typeof apply !== 'function') return;
  applyFn = apply;
  applying = false;
  emit();
}

/** Subscribe to update-availability changes. Returns an unsubscribe function. */
export function subscribeToUpdate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for useSyncExternalStore — true when a banner should be shown. */
export function isUpdateReady() {
  return applyFn !== null;
}

/** True once the player accepted and the reload is in flight. */
export function isUpdateApplying() {
  return applying;
}

/**
 * Activate the waiting worker and reload. Returns false when there is nothing
 * to apply, or when the apply function itself threw — the caller surfaces that
 * rather than leaving a dead button, the same rule downloadJson follows.
 */
export function applyUpdate() {
  if (!applyFn || applying) return false;
  applying = true;
  emit();
  try {
    applyFn();
    return true;
  } catch {
    applying = false;
    emit();
    return false;
  }
}

/**
 * "Later". Clears the banner without activating the worker — the waiting
 * worker stays waiting and takes over on the next natural start, and the old
 * precache keeps serving this session's chunks in the meantime.
 */
export function dismissUpdate() {
  if (!applyFn) return;
  applyFn = null;
  applying = false;
  emit();
}

/** Test-only: drop all module state between cases. */
export function resetUpdateStateForTests() {
  applyFn = null;
  applying = false;
  listeners.clear();
}
