/**
 * useGameState.mergeRemoteSections.test.js
 *
 * AVE-518 — a bounty (or any campaign edit) marked complete right after
 * opening/resuming the app flipped back to incomplete about a second later.
 *
 * Root cause: `refetchRow()` (useSupabaseSync.js) re-pulls the campaign row on
 * boot, reconnect, and foreground (AVE-372) and pushes it through the same
 * gated pipeline as a Realtime UPDATE. That gate protects against echoes of
 * writes we've already *sent* (`noteSelfWrite`/`consumeSelfEcho`), but a local
 * edit still sitting in the 400ms setState debounce window hasn't been sent
 * yet — it's invisible to that buffer. If the stale row from an in-flight
 * refetch (or a genuine edit from another player) arrives in that window, it
 * used to be applied wholesale over the fresh optimistic value, silently
 * reverting it.
 *
 * `mergeRemoteSections` (extracted from useGameState's handleRemoteChange)
 * closes that gap by skipping any section that still has an unflushed local
 * edit pending.
 */
import { describe, it, expect } from 'vitest';
import { mergeRemoteSections } from './useGameState';
import { createInitialState } from '../data/constants';
import { reduceToggleBountyComplete } from './gameReducers';

describe('mergeRemoteSections', () => {
  it('does not clobber a section with an unflushed local edit pending', () => {
    const base = createInitialState();
    // Player marks a bounty complete — optimistic local update, not yet sent.
    const afterToggle = reduceToggleBountyComplete(base, 'mir-c1-a-feud-between-guilds');

    // A stale remote row arrives (e.g. refetchRow() on foreground) that
    // doesn't yet reflect this edit — the pre-toggle campaign section.
    const staleRemote = { campaign: { campaign: base.campaign } };
    const pendingSections = new Set(['campaign']);

    const merged = mergeRemoteSections(afterToggle, staleRemote, pendingSections);

    expect(merged.campaign).toBe(afterToggle.campaign);
    expect(merged.campaign.completedBounties).toEqual([{ id: 'mir-c1-a-feud-between-guilds' }]);
  });

  it('applies a remote section once it is no longer pending', () => {
    const base = createInitialState();
    const afterToggle = reduceToggleBountyComplete(base, 'mir-c1-a-feud-between-guilds');

    // Matches the real shape: extractSection(state, 'campaign') → { campaign: state.campaign },
    // so an inbound 'campaign' section value is itself { campaign: <data> } (applyRemoteSection
    // spreads this value onto local state, setting local.campaign).
    const remoteRow = { campaign: { campaign: afterToggle.campaign } };
    const merged = mergeRemoteSections(base, remoteRow, new Set());

    expect(merged.campaign.completedBounties).toEqual([{ id: 'mir-c1-a-feud-between-guilds' }]);
  });

  it('applies sections that are not pending while skipping ones that are', () => {
    const base = createInitialState();
    const afterToggle = reduceToggleBountyComplete(base, 'mir-c1-a-feud-between-guilds');

    const sectionsToApply = {
      campaign: { campaign: base.campaign }, // stale — 'campaign' is pending, must be skipped
      resources: { sil: 42, lux: 3 },        // genuine remote change — 'resources' is not pending
    };
    const merged = mergeRemoteSections(afterToggle, sectionsToApply, new Set(['campaign']));

    expect(merged.campaign).toBe(afterToggle.campaign);
    expect(merged.sil).toBe(42);
    expect(merged.lux).toBe(3);
  });
});
