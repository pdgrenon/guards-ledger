/**
 * ids.js — unique ids for locally-created array elements.
 *
 * These ids are the merge key. `stonebound.locations`, `campaign.plans` and
 * `campaign.locations.sideQuests` are id-keyed arrays: the server's
 * `merge_jsonb_array_by_id` matches elements by `id`, and the AVE-287 tombstone
 * deletes mark `{ ...el, deleted: true }` rather than removing an element, so
 * every read site resolves an element by id too. Two elements sharing an id is
 * therefore not a cosmetic duplicate-React-key problem — it means editing one
 * plan edits the other, deleting one tombstones both, and the server merge
 * collapses the pair into a single element for every player.
 *
 * The previous generator was `Date.now() + Math.random()`, which looks like it
 * has ~2^53 of range and does not. `Date.now()` is ≈1.79e12, where the spacing
 * between adjacent doubles is ≈0.0004 — so almost all of `Math.random()`'s
 * entropy is truncated on the way in. Measured: 200,000 draws inside a single
 * millisecond produce **4,097 distinct values**, i.e. a ~1/4096 collision for
 * any two ids created in the same millisecond. That is rare for a human tapping
 * "+ Add plan" (taps are ~100ms apart, so `Date.now()` differs and there is no
 * collision at all) and routine for anything that adds in a loop — which is how
 * it surfaced, as an intermittent failure in the reducer tests.
 *
 * `crypto.randomUUID()` is 122 bits of entropy and cannot collide in practice.
 * It is only defined in a **secure context**, though, and the dev server over
 * `--host` on a plain-http LAN address is not one — a real way to run this app
 * on a phone. Hence the fallback, which is unique-by-construction within a
 * session (a monotonic counter) rather than relying on randomness alone.
 */

let counter = 0;

export function newId() {
  // Optional-chained twice on purpose: `crypto` is absent in some non-browser
  // environments, and `randomUUID` specifically is undefined in an insecure
  // context even though `crypto` itself exists.
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;

  // Fallback: timestamp for rough sortability, a session counter for guaranteed
  // local uniqueness (this is what the old generator lacked), and random bits so
  // two devices creating an element in the same millisecond still differ.
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

// Test seam — resets the fallback counter between cases.
export function __resetIdCounter() {
  counter = 0;
}
