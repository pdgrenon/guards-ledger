import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reportUpdateReady,
  subscribeToUpdate,
  isUpdateReady,
  isUpdateApplying,
  applyUpdate,
  dismissUpdate,
  resetUpdateStateForTests,
} from './swUpdate';

beforeEach(() => {
  resetUpdateStateForTests();
});

describe('swUpdate bridge', () => {
  it('starts with no update pending', () => {
    expect(isUpdateReady()).toBe(false);
    expect(isUpdateApplying()).toBe(false);
  });

  it('holds the update for a subscriber that arrives later', () => {
    // The service worker can report a waiting update before React mounts. A
    // plain event would be missed; the module state is the whole point.
    reportUpdateReady(() => {});
    expect(isUpdateReady()).toBe(true);

    const listener = vi.fn();
    subscribeToUpdate(listener);
    expect(isUpdateReady()).toBe(true);
  });

  it('notifies subscribers when an update is reported', () => {
    const listener = vi.fn();
    subscribeToUpdate(listener);

    reportUpdateReady(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-function apply', () => {
    reportUpdateReady(undefined);
    reportUpdateReady('reload');
    expect(isUpdateReady()).toBe(false);
  });

  it('unsubscribes', () => {
    const listener = vi.fn();
    const off = subscribeToUpdate(listener);
    off();

    reportUpdateReady(() => {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tolerates a listener that unsubscribes during the walk', () => {
    const seen = [];
    const offA = subscribeToUpdate(() => { seen.push('a'); offA(); });
    subscribeToUpdate(() => seen.push('b'));

    reportUpdateReady(() => {});
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('applyUpdate', () => {
  it('calls the apply function and latches applying', () => {
    const apply = vi.fn();
    reportUpdateReady(apply);

    expect(applyUpdate()).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(isUpdateApplying()).toBe(true);
  });

  it('does not send a second SKIP_WAITING before the reload lands', () => {
    const apply = vi.fn();
    reportUpdateReady(apply);

    applyUpdate();
    expect(applyUpdate()).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('returns false with nothing pending', () => {
    expect(applyUpdate()).toBe(false);
  });

  it('reports a throwing apply instead of leaving a dead button', () => {
    // Same rule downloadJson follows: surface the failure, do not swallow it.
    reportUpdateReady(() => { throw new Error('no controller'); });

    expect(applyUpdate()).toBe(false);
    expect(isUpdateApplying()).toBe(false);
    expect(isUpdateReady()).toBe(true);
  });

  it('notifies subscribers on both the latch and the rollback', () => {
    const listener = vi.fn();
    reportUpdateReady(() => { throw new Error('nope'); });
    subscribeToUpdate(listener);

    applyUpdate();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('dismissUpdate', () => {
  it('clears the banner without activating the worker', () => {
    const apply = vi.fn();
    reportUpdateReady(apply);

    dismissUpdate();
    expect(isUpdateReady()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('notifies subscribers', () => {
    reportUpdateReady(() => {});
    const listener = vi.fn();
    subscribeToUpdate(listener);

    dismissUpdate();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is a no-op with nothing pending', () => {
    const listener = vi.fn();
    subscribeToUpdate(listener);

    dismissUpdate();
    expect(listener).not.toHaveBeenCalled();
  });

  it('lets a later report re-arm the banner', () => {
    reportUpdateReady(() => {});
    dismissUpdate();

    const apply = vi.fn();
    reportUpdateReady(apply);
    expect(isUpdateReady()).toBe(true);
    expect(applyUpdate()).toBe(true);
  });
});
