/**
 * bounties.test.js
 *
 * Data-integrity checks for the static Bounty Quest reference data (AVE-359).
 * These guard the transcription against structural drift: right counts, unique
 * ids, valid cities/campaigns, and exactly two bounties per city per campaign.
 */

import { describe, it, expect } from 'vitest';
import { BOUNTIES, bountiesForCity } from './bounties';
import { CITIES } from './constants';

const CITY_NAMES = CITIES.map(c => c.name);

describe('BOUNTIES data', () => {
  it('contains all 48 bounties (6 cities × 4 campaigns × 2)', () => {
    expect(BOUNTIES).toHaveLength(48);
  });

  it('has a unique id for every bounty', () => {
    const ids = BOUNTIES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives each city from its Inn and maps to a real city', () => {
    for (const b of BOUNTIES) {
      expect(b.city).toBe(b.inn.split(':')[0].trim());
      expect(CITY_NAMES).toContain(b.city);
    }
  });

  it('only uses campaigns 1–4', () => {
    for (const b of BOUNTIES) {
      expect([1, 2, 3, 4]).toContain(b.campaign);
    }
  });

  it('carries the freeform text fields for every bounty', () => {
    for (const b of BOUNTIES) {
      expect(b.name).toBeTruthy();
      expect(b.location).toBeTruthy();
      expect(b.targets).toBeTruthy();
      expect(b.conditions).toBeTruthy();
      expect(b.rewards).toBeTruthy();
    }
  });

  it('has exactly two bounties for each city in each campaign', () => {
    for (const city of CITY_NAMES) {
      for (const campaign of [1, 2, 3, 4]) {
        expect(bountiesForCity(city, campaign)).toHaveLength(2);
      }
    }
  });
});

describe('bountiesForCity', () => {
  it('returns only the given city and campaign', () => {
    const result = bountiesForCity('Mir', 1);
    expect(result.every(b => b.city === 'Mir' && b.campaign === 1)).toBe(true);
  });

  it('returns [] for an unknown city', () => {
    expect(bountiesForCity('Atlantis', 1)).toEqual([]);
  });

  it('returns [] when campaign is undefined', () => {
    expect(bountiesForCity('Mir', undefined)).toEqual([]);
  });
});
