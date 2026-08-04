// @vitest-environment jsdom
/**
 * CorruptionBanner.test.jsx
 *
 * The banner is the app's only save-recovery UI (AVE-96). Its Import button
 * used to discard the result of `importState` entirely, so BOTH outcomes were
 * invisible: a rejected file (AVE-869's `looksLikeSave` guard) produced no
 * message at all, and a successful recovery left the red alarm banner up over a
 * restored ledger — where the next likely tap is Settings → Reset (AVE-929).
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';

import { CorruptionBanner } from './CorruptionBanner';

const h = React.createElement;

function setup(importResult) {
  const onImport  = vi.fn(() => Promise.resolve(importResult));
  const onDismiss = vi.fn();
  const utils = render(h(CorruptionBanner, {
    corruption: { reason: 'parse-failure', raw: '{not json' },
    onDismiss,
    onImport,
  }));
  return { onImport, onDismiss, ...utils };
}

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

function jsonFile(name = 'save.json') {
  return new File(['{"guards":[]}'], name, { type: 'application/json' });
}

// jsdom's FileList is read-only, so define `files` on the input directly —
// the same shape React reads in the change handler.
async function pick(input, file) {
  Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

afterEach(() => cleanup());

describe('CorruptionBanner import feedback (AVE-929)', () => {
  it('renders the rejection message when the import is refused', async () => {
    const message = "This file isn't a Guard's Ledger save.";
    const { onDismiss, container, getByText } = setup({ success: false, error: message });

    await pick(fileInput(container), jsonFile('corrupted-backup.json'));

    expect(getByText(message)).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses the banner on a successful import and shows no error', async () => {
    const { onDismiss, container, queryByText } = setup({ success: true });

    await pick(fileInput(container), jsonFile());

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(queryByText(/isn't a Guard's Ledger save/)).toBeNull();
  });

  it('clears a previous error once a later import succeeds', async () => {
    const message = 'Invalid save file.';
    const onImport = vi.fn()
      .mockResolvedValueOnce({ success: false, error: message })
      .mockResolvedValueOnce({ success: true });
    const onDismiss = vi.fn();
    const { container, queryByText } = render(h(CorruptionBanner, {
      corruption: { reason: 'invalid-shape', raw: '{}' },
      onDismiss,
      onImport,
    }));

    await pick(fileInput(container), jsonFile('wrong.json'));
    expect(queryByText(message)).toBeTruthy();

    await pick(fileInput(container), jsonFile('right.json'));
    expect(queryByText(message)).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('resets the input value so re-picking the SAME file fires change again', async () => {
    const { onImport, container } = setup({ success: false, error: 'Invalid save file.' });
    const input = fileInput(container);

    await pick(input, jsonFile('same.json'));
    expect(input.value).toBe('');

    await pick(input, jsonFile('same.json'));
    expect(onImport).toHaveBeenCalledTimes(2);
  });

  it('falls back to a generic message when the result carries no error string', async () => {
    const { container, getByText } = setup({ success: false });

    await pick(fileInput(container), jsonFile());

    expect(getByText('Import failed.')).toBeTruthy();
  });

  it('does nothing when the picker is dismissed without a file', async () => {
    const { onImport, onDismiss, container, queryByText } = setup({ success: true });

    await pick(fileInput(container), null);

    expect(onImport).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(queryByText('Import failed.')).toBeNull();
  });
});
