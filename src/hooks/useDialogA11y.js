import { useEffect, useRef } from 'react';

// Shared modal/overlay accessibility behavior. Attach the returned ref to the
// dialog element (the panel, not the backdrop). While `active`:
//   - moves focus into the dialog on open (first focusable, or the dialog itself)
//   - traps Tab / Shift+Tab within the dialog
//   - closes on Escape
//   - restores focus to the previously-focused element on close
//
// Every overlay in the app (settings, source popup, confirm, encounter detail)
// re-implemented an ad-hoc Escape listener and none managed focus; this hook is
// the single source of truth for that behavior.
// Elements reachable by Tab. Every clause must carry the exclusions itself.
//
// The trailing `[tabindex]:not([tabindex="-1"])` clause is an ADDITIONAL
// selector for elements that are not natively focusable (a div with
// tabindex="0"); it does NOT constrain the others. So a natively-focusable
// element matched `input:not([disabled])` no matter what its tabindex said —
// SettingsPanel's deliberately-unreachable file input (display:none,
// tabIndex={-1}, aria-hidden) was counted as a stop in the trap, contradicting
// the AVE-785 comment that put those attributes there.
//
// It happened to be harmless because it sits mid-list, but the trap only
// special-cases items[0] and items[last]: a hidden element in either position
// would make `first.focus()` silently no-op (browsers do not focus a
// display:none element), leaving focus on <body> — outside the dialog, where
// `document.activeElement` never equals first or last and Tab escapes the modal
// entirely. Applying the exclusions per-clause closes that.
//
// The exclusions are attribute-based on purpose: jsdom has no layout, so a
// visibility test via offsetParent / getClientRects would filter out every
// element under test and break the trap in the very tests that pin it.
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
]
  .map(sel => `${sel}:not([disabled]):not([tabindex="-1"]):not([aria-hidden="true"])`)
  .join(',');

export function useDialogA11y(active, onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep the ref current without triggering the main effect.
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement;

    // Move focus into the dialog.
    const focusables = dialog.querySelectorAll(FOCUSABLE);
    const first = focusables[0];
    if (first) {
      first.focus();
    } else {
      dialog.setAttribute('tabindex', '-1');
      dialog.focus();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = dialog.querySelectorAll(FOCUSABLE);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever was focused before the dialog opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return dialogRef;
}
