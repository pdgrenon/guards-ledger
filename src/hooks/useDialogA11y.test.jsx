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
