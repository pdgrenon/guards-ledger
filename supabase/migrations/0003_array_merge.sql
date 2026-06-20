-- AVE-197 — Array-aware field-level merge for concurrent multiplayer edits.
--
-- AVE-94 added `deep_merge_jsonb`, but it only deep-merges JSONB *objects*.
-- It never recurses into JSONB *arrays*: when the value at a key is an array,
-- the merge falls into the `else` branch and `jsonb_set` overwrites the whole
-- array with whatever the client sent — the exact "last write wins" bug
-- AVE-94 set out to fix, just one level deeper. This silently dropped
-- concurrent edits in several sections whose payloads carry arrays:
--   * cities                       (the full 6-element city array)
--   * campaign.plans               (array of { id, text, done })
--   * campaign.locations.sideQuests / .bounties  (arrays of { id, label })
--   * campaign.completedEncounters (array of plain encounter-id strings)
--   * stonebound.locations         (array of { id, type, selection, count })
--
-- This migration adds `merge_jsonb_array_by_id` and updates `deep_merge_jsonb`
-- to dispatch to it for array-typed values.
--
-- Merge semantics:
--   * Arrays of objects carrying a stable `id` key are merged element-by-id:
--     existing elements are preserved, elements whose `id` matches an incoming
--     element are deep-merged (recursing back into deep_merge_jsonb), and
--     elements present only in `incoming` are appended. cities is a fixed
--     6-element array (ids never added/removed), so it degrades gracefully to
--     a per-city deep merge — which also makes two players editing *different
--     fields of the same city* concurrently safe.
--   * Arrays of plain values (completedEncounters) merge as a set union.
--
-- Apply this to an existing database. Idempotent (CREATE OR REPLACE).
-- Fresh installs get the same definitions from schema.sql.

-- ─── merge_jsonb_array_by_id ─────────────────────────────────────────────────
-- Merge two JSONB arrays. Arrays of `id`-keyed objects are merged by id;
-- arrays of plain values are merged as a set union.
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

  -- Plain-value arrays (e.g. completedEncounters: an array of strings, no
  -- "id"-keyed objects) merge as a union instead of by id.
  if jsonb_array_length(incoming) = 0 or jsonb_typeof(incoming -> 0) <> 'object' or not ((incoming -> 0) ? 'id') then
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into result
    from (
      select v from jsonb_array_elements(existing) v
      union
      select v from jsonb_array_elements(incoming) v
    ) u(v);
    return result;
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

-- ─── deep_merge_jsonb (updated) ──────────────────────────────────────────────
-- Recursive JSONB merge: for each key in `incoming`:
--   - if both existing[k] and incoming[k] are JSONB objects, recurse
--   - if both existing[k] and incoming[k] are JSONB arrays, merge by id/union
--   - otherwise incoming[k] overwrites existing[k]
-- Keys present in `existing` but not in `incoming` are preserved.
create or replace function public.deep_merge_jsonb(existing jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(existing, '{}'::jsonb);
  k      text;
  v      jsonb;
begin
  if incoming is null then
    return result;
  end if;
  for k, v in select * from jsonb_each(incoming)
  loop
    if jsonb_typeof(result -> k) = 'object' and jsonb_typeof(v) = 'object' then
      result := jsonb_set(result, array[k], public.deep_merge_jsonb(result -> k, v));
    elsif jsonb_typeof(result -> k) = 'array' and jsonb_typeof(v) = 'array' then
      result := jsonb_set(result, array[k], public.merge_jsonb_array_by_id(result -> k, v));
    else
      result := jsonb_set(result, array[k], v);
    end if;
  end loop;
  return result;
end;
$$;

grant execute on function public.merge_jsonb_array_by_id(jsonb, jsonb) to anon, authenticated;
grant execute on function public.deep_merge_jsonb(jsonb, jsonb)        to anon, authenticated;
