/**
 * syncStatus.test.js
 *
 * The campaign pill and SyncBadge render from this one map. It previously
 * existed as two hand-maintained copies — an App-side dot-colour map and a
 * SettingsPanel-side label map — kept in agreement by a comment.
 *
 * The bug that motivated all of this: with no Supabase client, no sync
 * operation ever runs, so the status sat on 'idle' forever — which the badge
 * painted green and labelled "Synced" while nothing synced at all. That is
 * reachable in the field, because `campaignId` is restored from localStorage
 * independently of the client.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SYNC_STATUS, syncStatusView } from './syncStatus';
import { contrast } from '../contrast.test.js';

const CSS = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.css'), 'utf8');

// Every status useSupabaseSync can report, per its documented return contract.
const STATUSES = ['idle', 'syncing', 'error', 'offline', 'disabled'];

describe('SYNC_STATUS covers the whole status enum', () => {
  it('has an entry for every status the hook can return', () => {
    for (const status of STATUSES) {
      expect(SYNC_STATUS[status], `missing entry for "${status}"`).toBeTruthy();
    }
  });

  it('defines all four fields for each entry', () => {
    for (const [status, view] of Object.entries(SYNC_STATUS)) {
      for (const field of ['label', 'dot', 'text', 'phrase']) {
        expect(view[field], `${status}.${field}`).toBeTruthy();
      }
    }
  });

  it('gives every status a distinct label and phrase', () => {
    const labels  = Object.values(SYNC_STATUS).map(v => v.label);
    const phrases = Object.values(SYNC_STATUS).map(v => v.phrase);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(phrases).size).toBe(phrases.length);
  });
});

describe('a missing client never reads as healthy', () => {
  // The whole point. 'disabled' must not look or sound like 'idle'.
  it('disabled is visually distinct from idle', () => {
    expect(SYNC_STATUS.disabled.dot).not.toBe(SYNC_STATUS.idle.dot);
    expect(SYNC_STATUS.disabled.text).not.toBe(SYNC_STATUS.idle.text);
  });

  it('disabled is not green', () => {
    expect(SYNC_STATUS.disabled.dot).not.toContain('green');
    expect(SYNC_STATUS.disabled.text).not.toContain('green');
  });

  it('disabled never claims to be synced or connected', () => {
    // "Not syncing" contains "sync", which is fine — what must never appear is
    // the affirmative claim.
    expect(SYNC_STATUS.disabled.label).not.toMatch(/\bsynced\b/i);
    expect(SYNC_STATUS.disabled.phrase).not.toMatch(/\bsynced\b/i);
    expect(SYNC_STATUS.disabled.phrase).not.toMatch(/\bconnected\b/i);
    expect(SYNC_STATUS.disabled.phrase).toMatch(/not syncing/i);
  });
});

describe('syncStatusView fallback', () => {
  it('resolves a known status', () => {
    expect(syncStatusView('error').label).toBe('Sync error');
  });

  it('shows the raw value rather than an empty badge for an unknown status', () => {
    const view = syncStatusView('something-new');
    expect(view.label).toBe('something-new');
    expect(view.phrase).toBe('something-new');
    expect(view.dot).toBeTruthy();
  });

  it('does not fall back to a healthy-looking rendering', () => {
    expect(syncStatusView('something-new').dot).not.toBe(SYNC_STATUS.idle.dot);
  });
});

describe('badge text clears WCAG AA, and the dot is allowed not to', () => {
  // `text` and `dot` are deliberately different tokens: the dot is a 7px circle
  // (decoration, no contrast requirement) while the label is 12px text. The
  // base semantic colours are not usable as text — --c-red measures 3.93:1 and
  // --c-brand 4.02:1 on a light surface — which is why the -text/-ink variants
  // exist. This is the inline-style counterpart to contrast.test.js, which
  // parses CSS and structurally cannot see a colour set from JS.
  const splitAt   = CSS.indexOf('prefers-color-scheme');
  const THEMES = [
    { name: 'light', src: CSS.slice(0, splitAt),  surfaces: ['--c-bg', '--c-surface', '--c-surface2'] },
    { name: 'dark',  src: CSS.slice(splitAt),     surfaces: ['--c-bg', '--c-surface', '--c-surface2'] },
  ];

  // Resolve `var(--x)` to a hex literal, following one level of aliasing
  // (--c-brand-ink is `var(--c-brand)` in dark mode).
  function resolve(src, token, depth = 0) {
    const name = token.replace(/^var\(|\)$/g, '').trim();
    const m = src.match(new RegExp(`${name.replace(/-/g, '\\-')}:\\s*([^;]+);`));
    if (!m) return null;
    const value = m[1].trim();
    if (value.startsWith('#')) return value;
    if (value.startsWith('var(') && depth < 3) return resolve(src, value, depth + 1);
    return null;
  }

  for (const { name, src, surfaces } of THEMES) {
    it(`${name}: every status label clears 4.5:1 on every surface`, () => {
      const failures = [];
      for (const [status, view] of Object.entries(SYNC_STATUS)) {
        const fg = resolve(src, view.text);
        expect(fg, `${name}: could not resolve ${view.text}`).toBeTruthy();
        for (const surfaceToken of surfaces) {
          const bg = resolve(src, `var(${surfaceToken})`);
          const ratio = contrast(fg, bg);
          if (ratio < 4.5) {
            failures.push(`${status} ${view.text} (${fg}) on ${surfaceToken} (${bg}) = ${ratio.toFixed(2)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
