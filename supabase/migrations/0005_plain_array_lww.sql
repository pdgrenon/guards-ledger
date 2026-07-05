-- AVE-362 — Deleted guard satchel items reappear after a short delay.
--
-- AVE-197's `merge_jsonb_array_by_id` merges arrays of `id`-keyed objects
-- element-by-id, and merges every OTHER array as a set union
-- (`jsonb_agg(distinct …)` over existing ∪ incoming). A union can only ever
-- ADD elements, which breaks the two synced arrays that are NOT id-keyed:
--
--   * guard satchels — arrays of positional `{ item, qty }` slot objects.
--     Clearing a slot sends the cleaned 8-slot array, but the union merges
--     the old `{ item: 'X', qty: n }` element right back in. merge_section
--     bumps `guard_N_updated_at`, so the Realtime echo passes the AVE-314
--     timestamp gate; the resurrected array matches neither current local
--     state nor any self-write, so the client applies it — and the deleted
--     item pops back one round-trip later. The union's `distinct` also
--     dedupes the identical empty slots and reorders the array, shuffling
--     the satchel as a bonus.
--   * activeParty — a plain 2-element string array. Swapping a party member
--     unions old + new into a 3-element party.
--
-- The AVE-287 tombstone approach doesn't apply here: satchel slots are
-- positional (no stable id) and activeParty is a plain string pair. But
-- after AVE-287, EVERY array that actually needs merge semantics is
-- id-keyed (cities, plans, sideQuests/bounties, stonebound.locations,
-- completedEncounters, completedBounties) — the union branch protects
-- nothing anymore. So non-id arrays are now treated as a single value:
-- the incoming array replaces the existing one wholesale (last-write-wins),
-- exactly like a scalar field. Concurrent edits to the same non-id array
-- become last-write-wins — the already-accepted same-field limitation.
--
-- An EMPTY incoming array is ambiguous (nothing to inspect for an `id`), so
-- the existing value is preserved: the app's non-id arrays are fixed-size
-- and never empty, and id-keyed arrays shrink via tombstones, never by
-- sending [] — an empty incoming array therefore only ever means "nothing
-- to merge" (e.g. a fresh client whose plans list hasn't been populated).
--
-- No data repair needed: a satchel already mangled by the union self-heals
-- on the next edit of that guard, because the client always sends the full
-- rebuilt fixed-size satchel, which now overwrites the stored array.
--
-- Requires 0004 (completedEncounters converted to id-keyed objects) — a
-- pre-0004 string array would now be overwritten instead of unioned.
-- Apply to an existing database. Idempotent (CREATE OR REPLACE).
-- Fresh installs get the same definition from schema.sql.

create or replace function public.merge_jsonb_array_by_id(existing jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  elem    jsonb;
  elem_id jsonb;
  result  jsonb;
  idx     int;
  i       int;
begin
  if jsonb_typeof(existing) <> 'array' then
    return incoming;
  end if;
  if jsonb_typeof(incoming) <> 'array' then
    return incoming;
  end if;

  -- Empty incoming array: ambiguous (can't tell whether it is id-keyed), and
  -- in this app it only ever means "nothing to merge" — keep existing.
  if jsonb_array_length(incoming) = 0 then
    return existing;
  end if;

  -- Arrays NOT keyed by id (guard satchel slots, activeParty) are a single
  -- value: incoming replaces existing wholesale. The previous set-union merge
  -- could only add elements, so a deleted satchel item was resurrected by the
  -- write's own echo (AVE-362).
  if jsonb_typeof(incoming -> 0) <> 'object' or not ((incoming -> 0) ? 'id') then
    return incoming;
  end if;

  result := existing;
  for elem in select * from jsonb_array_elements(incoming)
  loop
    elem_id := elem -> 'id';
    idx := null;
    for i in 0 .. jsonb_array_length(result) - 1 loop
      if (result -> i) -> 'id' = elem_id then
        idx := i;
        exit;
      end if;
    end loop;

    if idx is null then
      result := result || jsonb_build_array(elem);
    else
      -- jsonb_set's path is text[]; an array index must be the index as text.
      result := jsonb_set(result, array[idx::text], public.deep_merge_jsonb(result -> idx, elem));
    end if;
  end loop;

  return result;
end;
$$;

grant execute on function public.merge_jsonb_array_by_id(jsonb, jsonb) to anon, authenticated;
