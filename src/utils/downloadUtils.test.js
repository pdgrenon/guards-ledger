// @vitest-environment jsdom
/**
 * downloadUtils.test.js — AVE-941
 *
 * jsdom implements neither URL.createObjectURL/revokeObjectURL nor anchor
 * navigation, so all three are stubbed. That is enough to pin the two things
 * the fix is actually about: the anchor is in the document when it is clicked,
 * and the object URL survives the call rather than being revoked in the same
 * tick as .click().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadJson } from './downloadUtils';

let createObjectURL;
let revokeObjectURL;
let clickSpy;
/** Snapshot of the anchor's state taken *during* the click. */
let seen;

beforeEach(() => {
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

  seen = null;
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function mockClick() {
      seen = {
        inDocument: document.body.contains(this),
        download:   this.getAttribute('download'),
        href:       this.getAttribute('href'),
      };
    });
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('downloadJson', () => {
  it('returns true and clicks an anchor that is attached to the document', () => {
    const ok = downloadJson('save.json', '{"a":1}');
    expect(ok).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(seen.inDocument).toBe(true);
    expect(seen.download).toBe('save.json');
    expect(seen.href).toBe('blob:mock-url');
  });

  it('removes the anchor again so the DOM is left clean', () => {
    downloadJson('save.json', '{}');
    expect(document.body.querySelector('a[download]')).toBe(null);
  });

  // The defect being fixed: revoking in the same tick as .click() can
  // invalidate the URL before the browser has read the blob, producing no file
  // and no error.
  it('does not revoke the object URL synchronously', () => {
    vi.useFakeTimers();
    downloadJson('save.json', '{}');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL on a later task', () => {
    vi.useFakeTimers();
    downloadJson('save.json', '{}');
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('returns false rather than throwing when the blob URL cannot be created', () => {
    vi.useFakeTimers();
    createObjectURL.mockImplementation(() => { throw new Error('nope'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(downloadJson('save.json', '{}')).toBe(false);
    // No URL was ever created, so nothing may be scheduled for revocation.
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('returns false when the click itself throws', () => {
    clickSpy.mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(downloadJson('save.json', '{}')).toBe(false);
  });
});
