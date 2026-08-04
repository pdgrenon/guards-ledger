// @vitest-environment jsdom
/**
 * useGameState.importValidation.test.jsx
 *
 * Import is the app's only recovery path AND its most destructive action: it
 * replaces the whole state tree, drops the undo snapshot, and (in a campaign)
 * pushes a full-row replacement to every co-player. It used to accept anything
 * that merely parsed as JSON, because `healState(migrateV1(x))` can never
 * return null — `migrateV1` `??`-defaults every field it reads, so it launders
 * a string, a number, an array, or an unrelated object into a valid-looking
 * default state (AVE-869).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState, looksLikeSave, migrateV1, healState } from './useGameState';
import { createInitialState } from '../data/constants';
import demoSave from '../data/demoSave.json';

const JUNK = [
  ['an unrelated JSON object', { some: 'unrelated json', foo: [1, 2, 3] }],
  ['a JSON array',             [1, 2, 3]],
  ['a JSON string',            'hello'],
  ['a JSON number',            42],
  ['null',                     null],
  ['a boolean',                true],
];

function fileWith(value) {
  return new File([JSON.stringify(value)], 'thing.json', { type: 'application/json' });
}

describe('looksLikeSave (AVE-869)', () => {
  it.each(JUNK)('rejects %s', (_label, value) => {
    expect(looksLikeSave(value)).toBe(false);
  });

  it('accepts a current (v2) save', () => {
    expect(looksLikeSave(createInitialState())).toBe(true);
  });

  it('accepts the v1-shaped demo save', () => {
    expect(looksLikeSave(demoSave)).toBe(true);
  });

  it('accepts a partial save carrying only one of the four marker keys', () => {
    // healState exists to rescue damaged saves; the guard must not be stricter
    // than it is.
    expect(looksLikeSave({ guards: [] })).toBe(true);
    expect(looksLikeSave({ cities: [] })).toBe(true);
    expect(looksLikeSave({ campaign: {} })).toBe(true);
    expect(looksLikeSave({ stash: {} })).toBe(true);
  });

  it('documents why healState cannot be the check on its own', () => {
    // The regression in one line: junk survives the migrate+heal pipeline
    // intact, so `if (!healed)` was unreachable for anything that parsed.
    expect(healState(migrateV1({ some: 'unrelated json' }))).not.toBeNull();
    expect(healState(migrateV1('hello'))).not.toBeNull();
    expect(healState(migrateV1(42))).not.toBeNull();
  });
});

describe('importState rejects a non-save file (AVE-869)', () => {
  beforeEach(() => { localStorage.clear(); });

  it.each(JUNK)('reports an error and leaves state untouched for %s', async (_label, value) => {
    const { result } = renderHook(() => useGameState());

    act(() => result.current.setSil(7));
    const before = JSON.stringify(result.current.state);

    let outcome;
    await act(async () => { outcome = await result.current.importState(fileWith(value)); });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBeTruthy();
    expect(JSON.stringify(result.current.state)).toBe(before);
  });

  // The banner's own "Download backup" button writes { reason, raw, backedUpAt }
  // to a filename one word away from a real save, so mis-picking it in a phone's
  // Downloads folder is the likeliest failure of the recovery flow. It must be
  // rejected *with a message* the banner can render (AVE-929).
  it('rejects the corrupted-backup file the banner itself produces', async () => {
    const { result } = renderHook(() => useGameState());
    const backup = {
      reason:     'parse-failure',
      raw:        '{"sil":12,"guards":[truncated',
      backedUpAt: '2026-07-14T10:00:00.000Z',
    };

    let outcome;
    await act(async () => { outcome = await result.current.importState(fileWith(backup)); });

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe("This file isn't a Guard's Ledger save.");
  });

  it('leaves the undo snapshot intact after a rejected import', async () => {
    const { result } = renderHook(() => useGameState());

    act(() => result.current.setSil(3));
    const label = result.current.undoLabel;
    expect(label).toBeTruthy();

    await act(async () => { await result.current.importState(fileWith({ not: 'a save' })); });

    // A rejected import performed no replacement, so there is nothing to
    // invalidate — Undo must still be able to walk back the last real edit.
    expect(result.current.undoLabel).toBe(label);
  });

  it('still imports a genuine save', async () => {
    const { result } = renderHook(() => useGameState());
    const save = { ...createInitialState(), sil: 123 };

    let outcome;
    await act(async () => { outcome = await result.current.importState(fileWith(save)); });

    expect(outcome.success).toBe(true);
    expect(result.current.state.sil).toBe(123);
  });

  it('still imports the v1-shaped demo save', async () => {
    const { result } = renderHook(() => useGameState());

    let outcome;
    await act(async () => { outcome = await result.current.importState(fileWith(demoSave)); });

    expect(outcome.success).toBe(true);
  });

  it('still reports an error for a file that is not JSON at all', async () => {
    const { result } = renderHook(() => useGameState());
    const file = new File(['<html>not json</html>'], 'page.html', { type: 'text/html' });

    let outcome;
    await act(async () => { outcome = await result.current.importState(file); });

    expect(outcome.success).toBe(false);
  });
});

describe('importState does not propagate a rejected file to the campaign (AVE-869)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('never calls replaceRow when the file is not a save', async () => {
    const replaceRow = vi.fn().mockResolvedValue({ error: null });
    const { result } = renderHook(() => useGameState());
    // Stand in for an active campaign: replaceRow is what pushes a full-row
    // replacement to every co-player.
    result.current.sync.replaceRow = replaceRow;

    await act(async () => { await result.current.importState(fileWith([1, 2, 3])); });

    expect(replaceRow).not.toHaveBeenCalled();
  });
});
