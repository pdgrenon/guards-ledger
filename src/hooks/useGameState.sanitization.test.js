/**
 * useGameState.sanitization.test.js
 *
 * Follow-up coverage for the on-load sanitization boundary:
 *   - AVE-580: numeric fields left un-clamped/un-coerced by the AVE-542/AVE-541
 *     heal work (baseAtk/baseDef, sil/lux, campaignId truncation, satchel qty
 *     lower bound).
 *   - AVE-577: `hasSeenOnboarding` backfill so a save predating the onboarding
 *     feature doesn't re-show the first-run overlay (which now offers a
 *     destructive "Load demo data").
 */
import { describe, it, expect } from 'vitest';
import { healState } from './useGameState';

describe('healState — numeric clamping / coercion (AVE-580)', () => {
  it('clamps and integer-truncates baseAtk / baseDef', () => {
    const g = healState({ guards: [{ name: 'Grigory', baseAtk: -3, baseDef: 2.7 }] }).guards[0];
    expect(g.baseAtk).toBe(0);
    expect(g.baseDef).toBe(2);
  });

  it('coerces stringified sil and clamps negative lux', () => {
    const s = healState({ sil: '100', lux: -5 });
    expect(s.sil).toBe(100);
    expect(s.lux).toBe(0);
  });

  it('truncates a fractional sil', () => {
    expect(healState({ sil: '3.9' }).sil).toBe(3);
  });

  it('integer-truncates a fractional campaignId so bounty/puzzle lookups still match', () => {
    const c = healState({ campaign: { campaignId: 2.9 } }).campaign;
    expect(c.campaignId).toBe(2);
  });

  it('lower-clamps and truncates satchel qty (0 / negative / fractional)', () => {
    const satchelOf = (qty) =>
      healState({ guards: [{ name: 'Grigory', satchel: [{ item: 'Pine', qty }] }] })
        .guards[0].satchel[0].qty;
    expect(satchelOf(0)).toBe(1);
    expect(satchelOf(-5)).toBe(1);
    expect(satchelOf(2.9)).toBe(2);
  });
});

describe('healState — onboarding backfill (AVE-577)', () => {
  it('backfills hasSeenOnboarding=true when the key is absent (pre-onboarding save)', () => {
    expect(healState({ settings: { initialized: true } }).settings.hasSeenOnboarding).toBe(true);
  });

  it('backfills hasSeenOnboarding=true when settings is missing entirely', () => {
    expect(healState({}).settings.hasSeenOnboarding).toBe(true);
  });

  it('respects an explicit hasSeenOnboarding=false (first-run user who reloaded without dismissing)', () => {
    const settings = { initialized: true, hasSeenOnboarding: false };
    expect(healState({ settings }).settings.hasSeenOnboarding).toBe(false);
  });

  it('respects an explicit hasSeenOnboarding=true', () => {
    const settings = { initialized: true, hasSeenOnboarding: true };
    expect(healState({ settings }).settings.hasSeenOnboarding).toBe(true);
  });
});
