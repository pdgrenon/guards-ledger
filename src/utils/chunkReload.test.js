import { describe, it, expect, vi } from 'vitest';
import {
  chunkKeyFromEvent,
  shouldReloadForChunk,
  installChunkReloadHandler,
  safeSessionStorage,
} from './chunkReload';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

/** Minimal window stand-in with a real listener registry. */
function fakeWindow() {
  const listeners = new Map();
  return {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    dispatch: (type, event) => {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    count: type => (listeners.get(type)?.size ?? 0),
  };
}

const preloadError = message => ({ payload: new Error(message) });

const FAILED_CRAFT =
  'Failed to fetch dynamically imported module: https://isofarian.averageideas.dev/assets/CraftTab-CRy_XOWG.js';
const FAILED_CAMPAIGN =
  'Failed to fetch dynamically imported module: https://isofarian.averageideas.dev/assets/CampaignTab-B-oJYqrc.js';

describe('chunkKeyFromEvent', () => {
  it('extracts the chunk URL from the browser message', () => {
    expect(chunkKeyFromEvent(preloadError(FAILED_CRAFT))).toBe(
      'https://isofarian.averageideas.dev/assets/CraftTab-CRy_XOWG.js',
    );
  });

  it('falls back to the message when it carries no URL', () => {
    expect(chunkKeyFromEvent(preloadError('Unable to preload CSS for x'))).toBe(
      'Unable to preload CSS for x',
    );
  });

  it('reads a payload that is a bare string, not an Error', () => {
    expect(chunkKeyFromEvent({ payload: FAILED_CRAFT })).toBe(
      'https://isofarian.averageideas.dev/assets/CraftTab-CRy_XOWG.js',
    );
  });

  it('returns null when there is nothing to key on', () => {
    // An unbounded key is how a reload loop starts, so "no key" must mean
    // "do not reload" rather than "reload every time".
    expect(chunkKeyFromEvent(undefined)).toBeNull();
    expect(chunkKeyFromEvent({})).toBeNull();
    expect(chunkKeyFromEvent({ payload: new Error('   ') })).toBeNull();
  });
});

describe('shouldReloadForChunk', () => {
  it('allows the first failure and refuses the second for the same chunk', () => {
    const storage = memoryStorage();
    expect(shouldReloadForChunk('a.js', storage)).toBe(true);
    expect(shouldReloadForChunk('a.js', storage)).toBe(false);
    expect(shouldReloadForChunk('a.js', storage)).toBe(false);
  });

  it('tracks chunks independently, so a later deploy gets its own retry', () => {
    const storage = memoryStorage();
    expect(shouldReloadForChunk('CraftTab-old.js', storage)).toBe(true);
    expect(shouldReloadForChunk('CraftTab-old.js', storage)).toBe(false);
    // New deploy, new hash — this is a fresh stale-chunk situation.
    expect(shouldReloadForChunk('CraftTab-new.js', storage)).toBe(true);
  });

  it('never reloads without a key', () => {
    const storage = memoryStorage();
    expect(shouldReloadForChunk(null, storage)).toBe(false);
    expect(shouldReloadForChunk('', storage)).toBe(false);
  });

  it('survives unparseable or non-array stored values', () => {
    for (const raw of ['not json', '{"a":1}', '5', 'null']) {
      const storage = memoryStorage({ guards_ledger_chunk_reload: raw });
      expect(shouldReloadForChunk('a.js', storage)).toBe(true);
    }
  });

  it('still allows the reload when storage is missing or throws', () => {
    // Losing the record costs one extra reload on a repeat failure; throwing
    // from the recovery path would cost the recovery itself.
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(shouldReloadForChunk('a.js', throwing)).toBe(true);
    expect(shouldReloadForChunk('a.js', null)).toBe(true);
  });

  it('caps the stored list so a pathological loop cannot grow it forever', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 50; i++) shouldReloadForChunk(`chunk-${i}.js`, storage);
    const stored = JSON.parse(storage.getItem('guards_ledger_chunk_reload'));
    expect(stored).toHaveLength(20);
    expect(stored.at(-1)).toBe('chunk-49.js');
  });
});

describe('installChunkReloadHandler', () => {
  it('reloads once for a failed chunk and not again for the same one', () => {
    const target = fakeWindow();
    const storage = memoryStorage();
    const reload = vi.fn();
    installChunkReloadHandler({ target, storage, reload });

    target.dispatch('vite:preloadError', preloadError(FAILED_CRAFT));
    expect(reload).toHaveBeenCalledTimes(1);

    target.dispatch('vite:preloadError', preloadError(FAILED_CRAFT));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads for a different chunk that has not been retried yet', () => {
    const target = fakeWindow();
    const storage = memoryStorage();
    const reload = vi.fn();
    installChunkReloadHandler({ target, storage, reload });

    target.dispatch('vite:preloadError', preloadError(FAILED_CRAFT));
    target.dispatch('vite:preloadError', preloadError(FAILED_CAMPAIGN));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('ignores an event with no usable key', () => {
    const target = fakeWindow();
    const reload = vi.fn();
    installChunkReloadHandler({ target, storage: memoryStorage(), reload });

    target.dispatch('vite:preloadError', {});
    expect(reload).not.toHaveBeenCalled();
  });

  it('unsubscribes cleanly', () => {
    const target = fakeWindow();
    const reload = vi.fn();
    const off = installChunkReloadHandler({ target, storage: memoryStorage(), reload });
    expect(target.count('vite:preloadError')).toBe(1);

    off();
    expect(target.count('vite:preloadError')).toBe(0);
    target.dispatch('vite:preloadError', preloadError(FAILED_CRAFT));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not throw on a target without event APIs', () => {
    expect(() => installChunkReloadHandler({ target: {}, storage: memoryStorage() })).not.toThrow();
  });
});

describe('safeSessionStorage', () => {
  it('returns null when reading sessionStorage throws', () => {
    const win = { get sessionStorage() { throw new Error('blocked'); } };
    expect(safeSessionStorage(win)).toBeNull();
  });

  it('returns the storage when available', () => {
    const storage = memoryStorage();
    expect(safeSessionStorage({ sessionStorage: storage })).toBe(storage);
  });
});
