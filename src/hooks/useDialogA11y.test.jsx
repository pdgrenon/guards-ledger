// @vitest-environment jsdom
/**
 * Tests for useDialogA11y — the shared overlay accessibility hook. Covers the
 * behaviors every overlay relies on: focus moves into the dialog on open,
 * Escape invokes onClose, focus is restored to the opener on close, and Tab is
 * trapped within the dialog.
 *
 * The harness is built with React.createElement rather than JSX so the test
 * matches the project's automatic-JSX-runtime lint config (no bare React import
 * flagged as unused) while still exercising the hook against a real DOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useDialogA11y } from './useDialogA11y';

const h = React.createElement;

function Dialog({ active, onClose }) {
  const ref = useDialogA11y(active, onClose);
  if (!active) return null;
  return h(
    'div',
    { ref, role: 'dialog' },
    h('button', null, 'first'),
    h('button', null, 'last'),
  );
}

describe('useDialogA11y', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(cleanup);

  it('moves focus to the first focusable element when opened', () => {
    const { getByText } = render(h(Dialog, { active: true, onClose: () => {} }));
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(h(Dialog, { active: true, onClose }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the previously focused element on close', () => {
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(h(Dialog, { active: true, onClose: () => {} }));
    expect(document.activeElement).not.toBe(opener);

    rerender(h(Dialog, { active: false, onClose: () => {} }));
    expect(document.activeElement).toBe(opener);
  });

  it('traps Tab from the last element back to the first', () => {
    const { getByText } = render(h(Dialog, { active: true, onClose: () => {} }));
    getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const { getByText } = render(h(Dialog, { active: true, onClose: () => {} }));
    getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('does not yank focus when onClose identity changes while open', () => {
    const { rerender } = render(h(Dialog, { active: true, onClose: () => {} }));
    const focusedEl = document.activeElement;

    // Re-render with a new onClose — focus should stay put.
    rerender(h(Dialog, { active: true, onClose: () => {} }));
    expect(document.activeElement).toBe(focusedEl);
  });
});

// A natively-focusable element matches `input:not([disabled])` regardless of
// its tabindex, so the trailing `[tabindex]:not([tabindex="-1"])` clause never
// filtered one out — SettingsPanel's hidden file input (AVE-785) was counted as
// a stop. Harmless there only because it sits mid-list; the trap special-cases
// only the first and last items, and a hidden element in either position makes
// `first.focus()` a silent no-op that leaves focus outside the dialog.
describe('useDialogA11y — FOCUSABLE excludes unreachable controls', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(cleanup);

  // Mirrors the SettingsPanel import row: a display:none, tabIndex={-1},
  // aria-hidden file input driven programmatically by a real button.
  // `position` places the hidden input before the first visible control or
  // after the last one — the two positions that actually break the trap, since
  // it only special-cases items[0] and items[items.length - 1].
  function DialogWithHiddenInput({ active, onClose, position }) {
    const ref = useDialogA11y(active, onClose);
    if (!active) return null;
    const hidden = h('input', {
      key: 'hidden', type: 'file', style: { display: 'none' },
      tabIndex: -1, 'aria-hidden': 'true', readOnly: true,
    });
    return h(
      'div',
      { ref, role: 'dialog' },
      position === 'first' ? hidden : null,
      h('button', { key: 'a' }, 'first'),
      h('button', { key: 'b' }, 'last'),
      position === 'last' ? hidden : null,
    );
  }

  it('skips a hidden tabindex="-1" input when choosing the initial focus', () => {
    const { getByText } = render(h(DialogWithHiddenInput, {
      active: true, onClose: () => {}, position: 'first',
    }));
    // Before the fix the hidden input was items[0]; focusing it silently
    // no-ops, so activeElement stayed on <body> — outside the dialog.
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('wraps Tab between the visible controls, ignoring the hidden input', () => {
    const { getByText } = render(h(DialogWithHiddenInput, {
      active: true, onClose: () => {}, position: 'first',
    }));
    getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('wraps Shift+Tab to the last visible control when the hidden input is last', () => {
    const { getByText } = render(h(DialogWithHiddenInput, {
      active: true, onClose: () => {}, position: 'last',
    }));
    getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    // Before the fix the hidden input WAS items[last], so Shift+Tab called
    // focus() on a display:none element — a silent no-op that left focus on the
    // first control and made the wrap look like it simply did nothing.
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('forward-wraps from the true last control when the hidden input trails it', () => {
    const { getByText } = render(h(DialogWithHiddenInput, {
      active: true, onClose: () => {}, position: 'last',
    }));
    getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Before the fix items[last] was the hidden input, so activeElement never
    // matched it and Tab was left to the browser — escaping the dialog.
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('still counts a disabled-free visible input as a stop', () => {
    function D({ onClose }) {
      const ref = useDialogA11y(true, onClose);
      return h('div', { ref, role: 'dialog' },
        h('input', { key: 'i', 'aria-label': 'code', readOnly: true }),
        h('button', { key: 'b' }, 'go'),
      );
    }
    const { getByLabelText } = render(h(D, { onClose: () => {} }));
    expect(document.activeElement).toBe(getByLabelText('code'));
  });
});

describe('useDialogA11y — the per-clause exclusions do not over-filter', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(cleanup);

  it('a plain button with no tabindex or aria-hidden is still a stop', () => {
    const { getByText } = render(h(Dialog, { active: true, onClose: () => {} }));
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('an explicit tabindex="0" element is still a stop', () => {
    function D({ onClose }) {
      const ref = useDialogA11y(true, onClose);
      return h('div', { ref, role: 'dialog' },
        h('div', { key: 'a', tabIndex: 0 }, 'custom'),
        h('button', { key: 'b' }, 'after'),
      );
    }
    const { getByText } = render(h(D, { onClose: () => {} }));
    expect(document.activeElement).toBe(getByText('custom'));
  });

  it('a disabled button is skipped, as before', () => {
    function D({ onClose }) {
      const ref = useDialogA11y(true, onClose);
      return h('div', { ref, role: 'dialog' },
        h('button', { key: 'a', disabled: true }, 'nope'),
        h('button', { key: 'b' }, 'yes'),
      );
    }
    const { getByText } = render(h(D, { onClose: () => {} }));
    expect(document.activeElement).toBe(getByText('yes'));
  });
});
