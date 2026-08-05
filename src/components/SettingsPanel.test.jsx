// @vitest-environment jsdom
/**
 * Tests for the SettingsPanel controls that had no coverage before the
 * 2026-07-24 audit:
 *
 *  - AVE-785 — Import save file must be reachable by keyboard. The control was
 *    a `display: none` input inside a bare <label> wrapping a <div>, so it had
 *    no tab stop at all: a keyboard-only player whose save had just been
 *    corrupted could not reach the app's only recovery path.
 *  - AVE-789 — Copy campaign code must report failure. Every clipboard error
 *    was swallowed into an empty catch, leaving a tap indistinguishable from a
 *    press the UI never registered.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused),
 * following src/components/Autocomplete.test.jsx. Props are plain stubs — no
 * game state, no Supabase — in the style of src/hooks/useDialogA11y.test.jsx.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

const h = React.createElement;

const ALL_GUARDS = ['Grigory', 'Alek', 'Catherine', 'Yury', 'Kharzin', 'Vera', 'Pavel', 'Yana'];

function makeState() {
  return {
    guards: ALL_GUARDS.map(name => ({ name, maxHp: 20 })),
    activeParty: ['Alek', 'Grigory'],
  };
}

function makeActions(overrides = {}) {
  return {
    adjustGuardMaxHp: vi.fn(),
    setPartySlot:     vi.fn(),
    exportState:      vi.fn(),
    importState:      vi.fn().mockResolvedValue({ success: true }),
    resetState:       vi.fn(),
    ...overrides,
  };
}

// isConfigured: false renders the short "not configured" multiplayer branch,
// keeping the fixture small for the save-data tests.
const SYNC_OFF = { isConfigured: false, campaignId: null, syncStatus: 'idle', syncError: null };
const SYNC_ON  = { isConfigured: true,  campaignId: 'WOLF-7F3K9Q', syncStatus: 'idle', syncError: null };

function setup({ sync = SYNC_OFF, actions = makeActions(), ...rest } = {}) {
  const onClose = vi.fn();
  const utils = render(
    h(SettingsPanel, {
      state: makeState(),
      actions,
      sync,
      guardColorMap: {},
      allGuards: ALL_GUARDS,
      onClose,
      ...rest,
    }),
  );
  const fileInput = utils.container.querySelector('input[type="file"]');
  return { onClose, actions, fileInput, ...utils };
}

/** A minimal .json save file for the file-input change events. */
function saveFile() {
  return new File(['{}'], 'save.json', { type: 'application/json' });
}

/** Attach `files` to the hidden input — jsdom does not let fireEvent set it. */
function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], writable: true, configurable: true });
  return act(async () => { fireEvent.change(input); });
}

describe('SettingsPanel — import is keyboard reachable (AVE-785)', () => {
  afterEach(() => cleanup());

  it('exposes Import JSON as a real button, not a div', () => {
    const { getByRole } = setup();
    const btn = getByRole('button', { name: /import json/i });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('forwards a click on the button to the hidden file input', () => {
    const { getByRole, fileInput } = setup();
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(getByRole('button', { name: /import json/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the hidden input out of the focus trap', () => {
    // The dialog's FOCUSABLE selector matches `input` textually; tabIndex -1 +
    // aria-hidden keep this one control down to a single tab stop.
    const { fileInput } = setup();
    expect(fileInput.getAttribute('tabindex')).toBe('-1');
    expect(fileInput.getAttribute('aria-hidden')).toBe('true');
  });

  it('places Import JSON in the tab order between Export JSON and Reset', () => {
    const { getAllByRole } = setup();
    const labels = getAllByRole('button').map(b => b.textContent);
    const exportIdx = labels.findIndex(t => /export json/i.test(t));
    const importIdx = labels.findIndex(t => /import json/i.test(t));
    const resetIdx  = labels.findIndex(t => /^reset$/i.test(t));
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBe(exportIdx + 1);
    expect(resetIdx).toBe(importIdx + 1);
  });

  it('calls importState once with the chosen file', async () => {
    const actions = makeActions();
    const { fileInput } = setup({ actions });
    const file = saveFile();

    await selectFile(fileInput, file);

    expect(actions.importState).toHaveBeenCalledTimes(1);
    expect(actions.importState).toHaveBeenCalledWith(file);
  });

  it('clears the input value after a successful import so the same file can be re-picked', async () => {
    const actions = makeActions();
    const { fileInput, onClose } = setup({ actions });

    await selectFile(fileInput, saveFile());

    expect(fileInput.value).toBe('');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the error and still clears the input value after a failed import', async () => {
    const actions = makeActions({
      importState: vi.fn().mockResolvedValue({ success: false, error: 'Invalid save file.' }),
    });
    const { fileInput, getByText, onClose } = setup({ actions });

    await selectFile(fileInput, saveFile());

    expect(getByText('Invalid save file.')).toBeTruthy();
    expect(fileInput.value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is dismissed with no file', async () => {
    const actions = makeActions();
    const { fileInput } = setup({ actions });

    Object.defineProperty(fileInput, 'files', { value: [], writable: true, configurable: true });
    await act(async () => { fireEvent.change(fileInput); });

    expect(actions.importState).not.toHaveBeenCalled();
  });
});

describe('SettingsPanel — copy campaign code reports failure (AVE-789)', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  function stubClipboard(writeText) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }

  afterEach(() => {
    cleanup();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete navigator.clipboard;
    vi.useRealTimers();
  });

  it('copies the code and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const { getByRole } = setup({ sync: SYNC_ON });
    const btn = getByRole('button', { name: /^copy$/i });

    await act(async () => { fireEvent.click(btn); });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('WOLF-7F3K9Q');
    expect(getByRole('button', { name: /copied!/i })).toBeTruthy();
  });

  it('reports failure and offers the manual path when the Clipboard API is absent', async () => {
    // jsdom does not implement the Clipboard API, so this is the default —
    // the same shape as any non-secure context.
    delete navigator.clipboard;
    const { getByRole, getByText } = setup({ sync: SYNC_ON });

    await act(async () => { fireEvent.click(getByRole('button', { name: /^copy$/i })); });

    expect(getByRole('button', { name: /copy failed/i })).toBeTruthy();
    expect(getByText(/select the code above and copy it manually/i)).toBeTruthy();
  });

  it('reports failure when writeText rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const { getByRole, getByText } = setup({ sync: SYNC_ON });

    await act(async () => { fireEvent.click(getByRole('button', { name: /^copy$/i })); });

    expect(getByRole('button', { name: /copy failed/i })).toBeTruthy();
    expect(getByText(/select the code above and copy it manually/i)).toBeTruthy();
  });

  it('resets the label and clears the hint after 3 seconds', async () => {
    vi.useFakeTimers();
    delete navigator.clipboard;
    const { getByRole, queryByText } = setup({ sync: SYNC_ON });

    await act(async () => { fireEvent.click(getByRole('button', { name: /^copy$/i })); });
    expect(queryByText(/copy it manually/i)).not.toBeNull();

    await act(async () => { vi.advanceTimersByTime(3000); });

    expect(getByRole('button', { name: /^copy$/i })).toBeTruthy();
    expect(queryByText(/copy it manually/i)).toBeNull();
  });

  it('does nothing at all without a campaign id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    // No campaignId → the join/create branch renders, so there is no Copy
    // button to press; assert the handler's guard by way of that branch.
    const { queryByRole } = setup({ sync: { ...SYNC_ON, campaignId: null } });

    expect(queryByRole('button', { name: /^copy$/i })).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('SettingsPanel — join code input (AVE-786)', () => {
  afterEach(() => cleanup());

  it('allows enough characters for a padded, pasted code', () => {
    // normalizeCampaignCode strips the padding before the lookup, but only if
    // the field did not truncate it away first.
    const { container } = setup({ sync: { ...SYNC_ON, campaignId: null } });
    const input = container.querySelector('input[type="text"]');
    expect(input.getAttribute('maxlength')).toBe('16');
    expect('WOLF - 7F3K9Q '.length).toBeLessThanOrEqual(16);
  });
});

describe('SettingsPanel — export reports a failed download (AVE-941)', () => {
  afterEach(() => cleanup());

  // downloadJson returns false rather than throwing (one of its callers is the
  // ErrorBoundary, where a throw would recurse), so a caller that discards the
  // return value turns a failed export into a button that silently does
  // nothing — directly above Reset, and inside the Join confirm whose whole
  // purpose is "back up before this replaces your ledger".
  it('shows a message when the export could not be downloaded', () => {
    const actions = makeActions({ exportState: vi.fn().mockReturnValue(false) });
    const { getByRole, queryByText } = setup({ actions });

    expect(queryByText(/could not be downloaded/i)).toBeNull();
    fireEvent.click(getByRole('button', { name: /export json/i }));

    expect(actions.exportState).toHaveBeenCalled();
    expect(queryByText(/could not be downloaded/i)).not.toBeNull();
  });

  it('stays silent when the export succeeds — the browser download UI is the confirmation', () => {
    const actions = makeActions({ exportState: vi.fn().mockReturnValue(true) });
    const { getByRole, queryByText } = setup({ actions });

    fireEvent.click(getByRole('button', { name: /export json/i }));

    expect(queryByText(/could not be downloaded/i)).toBeNull();
  });

  it('clears a previous failure once a later export succeeds', () => {
    const exportState = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { getByRole, queryByText } = setup({ actions: makeActions({ exportState }) });

    fireEvent.click(getByRole('button', { name: /export json/i }));
    expect(queryByText(/could not be downloaded/i)).not.toBeNull();

    fireEvent.click(getByRole('button', { name: /export json/i }));
    expect(queryByText(/could not be downloaded/i)).toBeNull();
  });
});
