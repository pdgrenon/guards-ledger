// @vitest-environment jsdom
/**
 * useGameState.corruption.test.jsx
 *
 * When a save cannot be parsed or healed, loadState boots a blank ledger and
 * reports `corruption` so App can render CorruptionBanner — Download backup /
 * Import save / Dismiss.
 *
 * That blank ledger used to come straight from `createInitialState()`, which
 * carries `hasSeenOnboarding: false` — so App also rendered the first-run
 * onboarding overlay, a full-screen backdrop, directly on top of the banner.
 * The banner is the app's only save-recovery UI and the only route to the raw
 * corrupted string (which its own Dismiss button then deletes from
 * localStorage), and the overlay covering it offers "Load demo data" as one of
 * two buttons.
 *
 * A corrupted save proves a returning player — the same reasoning healSettings
 * applies to a save predating the onboarding key — so the fallback state is
 * marked as already onboarded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameState } from './useGameState';

vi.mock('./useSupabaseSync', () => ({
  useSupabaseSync: () => ({
    upsertSection: vi.fn(),
    leaveCampaign: vi.fn(),
    enqueuePendingSections: vi.fn(),
    replaceRow: vi.fn(),
    campaignId: null,
    syncStatus: 'idle',
    syncError: null,
    createCampaign: vi.fn(),
    joinCampaign: vi.fn(),
    isConfigured: false,
  }),
  guardColumn: (i) => `guard_${i}`,
  applyRemoteSection: vi.fn(),
  CAMPAIGN_ID_KEY: 'guards_ledger_campaign_id',
}));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the corruption fallback ledger does not re-trigger onboarding', () => {
  it('reports the corruption and suppresses the first-run overlay on a parse failure', () => {
    localStorage.setItem('guards_ledger_v2', '{not json');

    const { result } = renderHook(() => useGameState());

    expect(result.current.corruption?.reason).toBe('parse-failure');
    // App renders the overlay on `!state.settings.hasSeenOnboarding`.
    expect(result.current.state.settings.hasSeenOnboarding).toBe(true);
  });

  it('does the same for a save that parses but has an unrecognizable shape', () => {
    // healState returns null only for a non-object; looksLikeSave does not gate
    // the load path, so this is what "invalid-shape" reaches it as.
    localStorage.setItem('guards_ledger_v2', '"just a string"');

    const { result } = renderHook(() => useGameState());

    expect(result.current.corruption?.reason).toBe('invalid-shape');
    expect(result.current.state.settings.hasSeenOnboarding).toBe(true);
  });

  it('still shows onboarding for a genuine first run', () => {
    const { result } = renderHook(() => useGameState());

    expect(result.current.corruption).toBe(null);
    expect(result.current.state.settings.hasSeenOnboarding).toBe(false);
  });
});
