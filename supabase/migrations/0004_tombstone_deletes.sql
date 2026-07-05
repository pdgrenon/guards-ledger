-- AVE-287 — Tombstone (soft-delete) support for synced array elements.
--
-- PROBLEM
-- The server merge `merge_jsonb_array_by_id` (AVE-197) is append/union-only:
-- it can never remove an element from a synced array. So while a campaign is
-- active, a hard-delete of an array item (a plan, side quest, bounty, stonebound
-- location, or completed encounter) is silently undone — the merge restores the
-- element and the inbound Realtime echo re-applies it on the originating client.
--
-- APPROACH: tombstones
-- The client now soft-deletes: instead of filtering an element out, it marks it
-- `{ ...el, deleted: true }` and all read sites filter tombstoned elements out.
--
--   * id-keyed arrays (campaign.plans, campaign.locations.sideQuests/bounties,
--     stonebound.locations) need NO function change: `merge_jsonb_array_by_id`
--     already deep-merges matching-id elements, so the incoming `deleted: true`
--     flag is carried onto the existing element exactly like any other field
--     edit — and a concurrent add of a *different* id still survives, because
--     each element is merged independently by id.
--
--   * campaign.completedEncounters was a plain array of encounter-id STRINGS,
--     which the merge treats as a set union (also unable to remove). Rather than
--     special-casing removal in the union path (a 2P-set that can't re-complete
--     an encounter after un-completing it), we convert it to the same id-keyed
--     object shape the other arrays use: ["for-the-king"] → [{"id":"for-the-king"}].
--     It then flows through the by-id merge and gets tombstones for free, and
--     re-completing is just clearing the flag (last-write-wins on the boolean).
--
-- This migration therefore changes NO functions — it only performs the one-time
-- data conversion of completedEncounters on existing rows. The client heals the
-- same shape on load (normalizeCompletedEncounters) and tolerates an unmigrated
-- row on read (normalizeRow), so applying this is safe at any time.
--
-- Idempotent: the WHERE clause only touches rows that still hold string elements.

update public.campaigns
set campaign = jsonb_set(
  campaign,
  '{completedEncounters}',
  (
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(elem) = 'string' then jsonb_build_object('id', elem)
          else elem
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(campaign -> 'completedEncounters') elem
  )
)
where campaign ? 'completedEncounters'
  and jsonb_typeof(campaign -> 'completedEncounters') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(campaign -> 'completedEncounters') e
    where jsonb_typeof(e) = 'string'
  );
