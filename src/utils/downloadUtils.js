/**
 * downloadUtils.js
 *
 * One place to trigger a client-side file download, shared by every save-export
 * path in the app (AVE-941).
 *
 * All three call sites used to build their own detached `<a>`, click it, and
 * revoke the object URL in the same tick. Two hazards in that shape:
 *
 *   1. Revoking invalidates the URL immediately, and whether the download that
 *      `.click()` initiated has already read the blob at that point is not
 *      guaranteed across engines. Losing that race produces no file and no
 *      error.
 *   2. An anchor that is never attached to the document has historically been
 *      the difference between "download starts" and "nothing happens".
 *
 * Neither is expensive to rule out, and these are the app's *only* backup paths
 * — the corruption banner (AVE-96), the ErrorBoundary crash screen, and
 * Settings → Export. Each of them sits directly beside a destructive button
 * (Dismiss, Reload, Reset), so a silent no-op costs the player the very data
 * they were trying to rescue.
 */

/**
 * Trigger a download of `text` as `filename`.
 *
 * @returns {boolean} true if the download was initiated, false if it threw.
 * Callers that sit beside a destructive control surface the false case; the
 * browser's own download UI is the success confirmation.
 */
export function downloadJson(filename, text) {
  let url;
  try {
    const blob = new Blob([text], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (e) {
    console.error('Download failed', e);
    return false;
  } finally {
    // Later task, not this one: a microtask still runs before the browser has
    // processed the download, and 0ms is the same race one turn later. The URL
    // is released on document unload regardless, so a delay costs nothing.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
