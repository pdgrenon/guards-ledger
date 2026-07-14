-- AVE-527 — Campaign reset/import racing a co-player's in-flight write
-- resurrects the old campaign on the server.
--
-- Symptom: player A resets (or imports over) the campaign while player B makes
-- any edit at roughly the same moment. B's debounced `merge_section` write
-- serializes AFTER A's full-row `replaceRow` UPDATE — and because every client
-- write carries the whole section, B's entire old `campaign` object (old plans,
-- tokens, completions…) is deep-merged back into the freshly reset row. The
-- merge's Realtime echo then applies it back onto A's screen: the reset visibly
-- undoes itself.
--
-- Root cause: `replaceRow` is a raw full-row UPDATE with no coordination against
-- concurrent `merge_section` calls, and `merge_section` happily merges a stale
-- full-section payload into whatever row it finds.
--
-- Fix (server-side generation counter): `replaceRow` bumps a monotonic
-- `generation` column on every full replacement (reset/import). Every
-- `merge_section` call carries the generation the client last saw as
-- `expected_generation`; the merge only fires when the row's current generation
-- still matches. A write built against generation N against a row now at N+1
-- (because a reset landed in between) becomes a no-op server-side — the stale
-- old-campaign payload never lands. The client's next refetch/echo delivers the
-- post-reset truth. `merge_section` itself never touches `generation`, so the
-- counter changes only via `replaceRow`; two concurrent normal writes are
-- unaffected (both carry the same generation, both match).
--
-- Apply to an existing database. Idempotent (add-column IF NOT EXISTS +
-- CREATE OR REPLACE). Fresh installs get the same definitions from schema.sql.

alter table public.campaigns
  add column if not exists generation bigint not null default 0;

-- Drop the pre-AVE-527 three-argument overload so only the generation-aware
-- four-argument version remains (avoids a stale overload lingering alongside it).
drop function if exists public.merge_section(text, text, jsonb);

create or replace function public.merge_section(
  campaign_id         text,
  section_name        text,
  payload             jsonb,
  expected_generation bigint default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  valid_sections text[] := array[
    'resources', 'cities', 'party',
    'guard_0', 'guard_1', 'guard_2', 'guard_3',
    'guard_4', 'guard_5', 'guard_6', 'guard_7',
    'stash', 'campaign'
  ];
  ts_col text;
  merged jsonb;
begin
  if section_name <> all(valid_sections) then
    raise exception 'unknown section name: %', section_name
      using errcode = '22023';
  end if;

  ts_col := quote_ident(section_name || '_updated_at');

  -- Read and write in one statement (AVE-373). The added WHERE on the DO UPDATE
  -- gates the merge on generation (AVE-527): when `expected_generation` is null
  -- (a client that hasn't adopted the counter, or a call that opts out) the
  -- predicate is `c.generation = c.generation` and always fires — fully
  -- backward compatible. When it is a value, a write built against an older
  -- generation than the row now holds (a reset/import landed in between) matches
  -- nothing and the DO UPDATE is skipped, so RETURNING yields no row and `merged`
  -- is null — a silent no-op. On a fresh INSERT (no conflict) the WHERE does not
  -- apply and the row is created at the default generation 0.
  execute format(
    'insert into public.campaigns as c (id, %I, %s) values ($1, $2, now()) '
    'on conflict (id) do update set '
    '  %I = public.deep_merge_jsonb(c.%I, excluded.%I), '
    '  %s = excluded.%s '
    'where c.generation = coalesce($3, c.generation) '
    'returning c.%I',
    section_name, ts_col,
    section_name, section_name, section_name,
    ts_col, ts_col,
    section_name
  )
    into merged
    using campaign_id, payload, expected_generation;

  return merged;
end;
$$;

grant execute on function public.merge_section(text, text, jsonb, bigint) to anon, authenticated;
