// @vitest-environment jsdom
/**
 * The campaign pill must never claim a sync that is not happening.
 *
 * `campaignId` is restored from localStorage independently of the Supabase
 * client, so a deploy that loses its env vars leaves every returning player
 * holding a stored campaign code with no sync behind it. The pill rendered on
 * `campaignId` alone with `syncStatus` sitting at its 'idle' initial value —
 * a green dot and "Connected to campaign WOLF-7F3K9Q" — while nothing synced.
 * This happened in production.
 *
 * Testing it end-to-end needs the module graph re-evaluated with the Supabase
 * env vars absent: `defaultSupabase` is computed once at module scope, and the
 * repo ships a committed `.env` that Vite loads in test mode too, so a plain
 * render always gets a real client. vi.stubEnv + vi.resetModules + a dynamic
 * import is what actually exercises the unconfigured path.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { SYNC_STATUS } from './utils/syncStatus';

const CAMPAIGN = 'WOLF-7F3K9Q';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('guards_ledger_v2', JSON.stringify({
    settings: { initialized: true, hasSeenOnboarding: true },
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Render App with the Supabase env vars present or absent. */
async function renderApp({ configured }) {
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://example.supabase.co' : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'test-anon-key' : '');
  vi.resetModules();
  const { default: App } = await import('./App.jsx');
  return render(React.createElement(App));
}

const pill = () => screen.queryByRole('button', { name: new RegExp(`^Campaign ${CAMPAIGN}`) });

describe('no Supabase client, stored campaign id', () => {
  beforeEach(() => { localStorage.setItem('guards_ledger_campaign_id', CAMPAIGN); });

  it('does not claim to be synced or connected', async () => {
    await renderApp({ configured: false });
    const label = pill().getAttribute('aria-label');

    expect(label).toMatch(/not syncing/i);
    expect(label).not.toMatch(/\bsynced\b/i);
    expect(label).not.toMatch(/\bconnected\b/i);
  });

  it('does not show a green dot', async () => {
    await renderApp({ configured: false });
    const dot = pill().querySelector('.campaign-pill-dot');

    expect(dot.style.background).not.toContain('green');
    expect(dot.style.background).toBe(SYNC_STATUS.disabled.dot);
  });

  it('still shows the code, so the player can see which campaign is stranded', async () => {
    await renderApp({ configured: false });
    expect(pill().textContent).toContain(CAMPAIGN);
  });
});

describe('Supabase configured', () => {
  it('an active campaign reads as synced, with the green dot', async () => {
    localStorage.setItem('guards_ledger_campaign_id', CAMPAIGN);
    await renderApp({ configured: true });

    const label = pill().getAttribute('aria-label');
    expect(label).toContain(SYNC_STATUS.idle.phrase);
    expect(pill().querySelector('.campaign-pill-dot').style.background)
      .toBe(SYNC_STATUS.idle.dot);
  });

  it('renders no pill at all without a stored campaign', async () => {
    await renderApp({ configured: true });
    expect(pill()).toBeNull();
  });
});

describe('the pill and the badge cannot drift apart', () => {
  it('both render from the same shared map', async () => {
    // App and SettingsPanel previously kept separate status maps held in
    // agreement by a comment. Assert they resolve through the one module.
    const read = rel => fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    const appSrc   = read('App.jsx');
    const panelSrc = read('components/SettingsPanel.jsx');

    expect(appSrc).toContain('syncStatusView');
    expect(panelSrc).toContain('syncStatusView');
    // And neither defines its own colour table any more.
    expect(appSrc).not.toMatch(/SYNC_DOT_COLOR\s*=/);
    expect(panelSrc).not.toMatch(/const config = \{/);
  });
});
