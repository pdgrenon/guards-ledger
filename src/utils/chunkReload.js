/**
 * chunkReload.js
 *
 * Self-heal a failed lazy-chunk load by reloading once.
 *
 * When a `lazy()` import fails, Vite's preload helper dispatches a cancelable
 * `vite:preloadError` on window and — unless the event is canceled — rethrows,
 * which lands in the tab-level ErrorBoundary. That fallback already detects a
 * chunk error and offers Reload (ErrorBoundary.jsx), but it makes the player
 * read a message and press a button mid-game, and it fires on the one gesture
 * that is meant to be instant: switching tabs.
 *
 * So we reload for them. The event is deliberately **not** canceled: if the
 * reload is blocked or slow, the rethrow still reaches the ErrorBoundary and
 * the player gets today's behaviour rather than a blank tab. Canceling would
 * make the helper resolve to `undefined`, which React.lazy turns into a
 * confusing "cannot read .default" TypeError instead of the accurate
 * chunk-error fallback.
 *
 * The guard against reload loops is keyed by **failing chunk URL**, not a bare
 * "already tried once" flag. A stale hash is fixed by exactly one reload, so a
 * URL that fails twice is a genuinely broken build and must surface rather than
 * spin. Keying by URL also re-arms automatically: a second deploy later in the
 * same session produces different hashes, so it gets its own single retry. The
 * list lives in sessionStorage, so it does not leak across tabs or outlive one.
 */

const ATTEMPT_KEY = 'guards_ledger_chunk_reload';
// Bounded so a pathological loop cannot grow the entry without limit. Well
// above the five lazy chunks the app actually has.
const MAX_ATTEMPTS = 20;

/** sessionStorage, or null when it throws (private modes, blocked storage). */
export function safeSessionStorage(win = globalThis) {
  try {
    return win.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readAttempts(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(ATTEMPT_KEY) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

function writeAttempts(storage, urls) {
  try {
    storage?.setItem(ATTEMPT_KEY, JSON.stringify(urls.slice(-MAX_ATTEMPTS)));
  } catch {
    // Storage full or blocked. Losing the record only costs one extra reload
    // on a repeat failure, which is far better than throwing from a handler
    // whose whole job is recovering from a failure.
  }
}

/**
 * Identify the failed chunk from a `vite:preloadError` event.
 *
 * Returns the URL when the message carries one ("Failed to fetch dynamically
 * imported module: https://…/assets/CraftTab-abc.js"), otherwise the message
 * itself, so messages without a URL ("Unable to preload CSS for …") still get
 * a stable key. Null when there is nothing to key on at all — in which case we
 * do not reload, since an unbounded key is exactly how a loop starts.
 */
export function chunkKeyFromEvent(event) {
  const payload = event?.payload;
  const text = String(payload?.message ?? payload ?? '').trim();
  if (!text) return null;
  return text.match(/https?:\/\/[^\s'")]+/)?.[0] ?? text;
}

/**
 * Record an attempt for `key` and report whether a reload should happen.
 * False when we have already reloaded for this exact chunk in this session.
 */
export function shouldReloadForChunk(key, storage) {
  if (!key) return false;
  const attempts = readAttempts(storage);
  if (attempts.includes(key)) return false;
  writeAttempts(storage, [...attempts, key]);
  return true;
}

/**
 * Listen for chunk-load failures and reload once per distinct failure.
 * Returns an unsubscribe function.
 */
export function installChunkReloadHandler({
  target = globalThis,
  storage = safeSessionStorage(target),
  reload = () => target.location.reload(),
} = {}) {
  const handler = event => {
    if (!shouldReloadForChunk(chunkKeyFromEvent(event), storage)) return;
    reload();
  };
  target.addEventListener?.('vite:preloadError', handler);
  return () => target.removeEventListener?.('vite:preloadError', handler);
}
