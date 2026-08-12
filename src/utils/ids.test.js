import { describe, it, expect, afterEach, vi } from 'vitest';
import { newId, __resetIdCounter } from './ids';

const DRAWS = 200_000;

afterEach(() => {
  vi.unstubAllGlobals();
  __resetIdCounter();
});

describe('newId', () => {
  it('returns a string', () => {
    expect(typeof newId()).toBe('string');
  });

  it('produces no collisions across 200k draws in a tight loop', () => {
    // The direct regression for the bug this replaced. `Date.now() +
    // Math.random()` produced exactly 4,097 distinct values here, because the
    // double spacing at ~1.79e12 is ~0.0004 and truncates almost all of
    // Math.random()'s entropy. A tight loop is the honest test: it pins the
    // same-millisecond case, which is the only one that ever collided.
    const seen = new Set();
    for (let i = 0; i < DRAWS; i++) seen.add(newId());
    expect(seen.size).toBe(DRAWS);
  });
});

describe('newId — insecure-context fallback', () => {
  // crypto.randomUUID is undefined outside a secure context, which includes the
  // dev server over --host on a plain-http LAN address — a real way to run this
  // app on a phone. The fallback has to be just as collision-free.
  function withoutRandomUUID() {
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: undefined });
  }

  it('still returns an id when crypto.randomUUID is unavailable', () => {
    withoutRandomUUID();
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('still returns an id when crypto itself is absent', () => {
    vi.stubGlobal('crypto', undefined);
    expect(typeof newId()).toBe('string');
  });

  it('produces no collisions across 200k fallback draws in a tight loop', () => {
    withoutRandomUUID();
    const seen = new Set();
    for (let i = 0; i < DRAWS; i++) seen.add(newId());
    expect(seen.size).toBe(DRAWS);
  });

  it('is unique by construction, not by luck — a frozen clock and a constant Math.random still differ', () => {
    // Strips both entropy sources the old generator relied on. The monotonic
    // session counter is what has to carry uniqueness here; without it this is
    // exactly the old bug.
    withoutRandomUUID();
    vi.spyOn(Date, 'now').mockReturnValue(1_786_539_696_806);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(1000);
    vi.restoreAllMocks();
  });
});
