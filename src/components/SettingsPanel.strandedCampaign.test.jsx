// @vitest-environment jsdom
/**
 * A campaign id outlives the configuration that created it.
 *
 * `campaignId` is restored from localStorage independently of the Supabase
 * client, so a deploy that loses its env vars leaves every returning player
 * holding a stored campaign code with no sync behind it. Before this, that
 * player saw a campaign pill in the top bar with a green dot, a "Synced" badge,
 * and — in Settings — no mention of the campaign at all and no way to clear it.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { createInitialState } from '../data/constants';
import { GUARD_COLOR_MAP, GUARDS } from '../data/constants';
import { SYNC_STATUS } from '../utils/syncStatus';

const h = React.createElement;

function setup(sync) {
  const leaveCampaign = vi.fn();
  const utils = render(h(SettingsPanel, {
    state: createInitialState(),
    actions: {
      adjustGuardMaxHp: vi.fn(), setPartySlot: vi.fn(),
      exportState: vi.fn(), importState: vi.fn(), resetState: vi.fn(),
    },
    sync: {
      campaignId: null, syncStatus: 'idle', syncError: null,
      upsertSection: vi.fn(), createCampaign: vi.fn(), joinCampaign: vi.fn(),
      leaveCampaign, isConfigured: true,
      ...sync,
    },
    guardColorMap: GUARD_COLOR_MAP,
    allGuards: GUARDS,
    scrollToMultiplayer: false,
    onClose: vi.fn(),
  }));
  return { leaveCampaign, ...utils };
}

beforeEach(() => { cleanup(); localStorage.clear(); });

describe('unconfigured build with a stored campaign', () => {
  const stranded = { isConfigured: false, campaignId: 'WOLF-7F3K9Q', syncStatus: 'disabled' };

  it('names the campaign instead of pretending it is not there', () => {
    setup(stranded);
    expect(screen.getByText(/WOLF-7F3K9Q/)).toBeTruthy();
  });

  it('says plainly that nothing is being synced, and that local data is safe', () => {
    setup(stranded);
    expect(screen.getByText(/nothing is being sent or received/i)).toBeTruthy();
    expect(screen.getByText(/still saved locally/i)).toBeTruthy();
  });

  it('shows the disabled badge, not a green Synced one', () => {
    setup(stranded);
    expect(screen.getByText(SYNC_STATUS.disabled.label)).toBeTruthy();
    expect(screen.queryByText(SYNC_STATUS.idle.label)).toBeNull();
  });

  it('offers a way out — Leave works without a client', () => {
    const { leaveCampaign } = setup(stranded);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    // It confirms first — Leave clears the only copy of the code on this
    // device, so it goes through the same modal as the configured path.
    expect(leaveCampaign).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /leave campaign/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));

    // leaveCampaign is purely local — it never touches the server row — so it
    // works with no client at all.
    expect(leaveCampaign).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirm leaves the campaign in place', () => {
    const { leaveCampaign } = setup(stranded);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = screen.getByRole('dialog', { name: /leave campaign/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(leaveCampaign).not.toHaveBeenCalled();
  });

  it('still explains that multiplayer is unconfigured', () => {
    setup(stranded);
    expect(screen.getByText(/not configured in this environment/i)).toBeTruthy();
  });

  it('offers no Create or Join controls, which cannot work here', () => {
    setup(stranded);
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
  });
});

describe('unconfigured build with no stored campaign', () => {
  it('says only that multiplayer is unconfigured — nothing to strand', () => {
    setup({ isConfigured: false, campaignId: null, syncStatus: 'disabled' });
    expect(screen.getByText(/not configured in this environment/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    expect(screen.queryByText(/nothing is being sent or received/i)).toBeNull();
  });
});

describe('configured build is unaffected', () => {
  it('an active campaign still shows the code, Copy, and a Synced badge', () => {
    setup({ isConfigured: true, campaignId: 'WOLF-7F3K9Q', syncStatus: 'idle' });
    expect(screen.getByText('WOLF-7F3K9Q')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByText(SYNC_STATUS.idle.label)).toBeTruthy();
    expect(screen.queryByText(/nothing is being sent or received/i)).toBeNull();
  });

  it('no campaign still shows Create and Join', () => {
    setup({ isConfigured: true, campaignId: null, syncStatus: 'idle' });
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
  });
});
