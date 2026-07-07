-- app_state_patch_v2 — merge-safe saves for month-keyed domain data
-- =====================================================================
-- WHY: v1 (app_state_patch) replaces each storage key's WHOLE value.
-- All roster months live inside one key (nirm-allAsgn), so two tabs
-- editing DIFFERENT months in the same ~1s window last-writer-wins and
-- one manager's edit is silently lost.
--
-- v2 deep-merges ONE level down for the three collaborative month-map
-- keys (nirm-allAsgn, nirm-allExtraHrs, nirm-allBrandAsgn): each month
-- inside the key is replaced individually, so July edits from one tab
-- and June edits from another can never wipe each other. All other keys
-- keep v1 replace semantics (arrays like agents/brands must replace).
--
-- The client (src/supabase.js) calls v2 automatically and falls back to
-- v1 if this function is not installed yet — so running this script is
-- safe at any time, before or after deploying the client.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run (CREATE OR REPLACE). Does NOT touch app_state data.

create or replace function public.app_state_patch_v2(
  p_updates    jsonb,
  p_deletes    text[] default null,
  p_updated_by text   default null
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  merge_keys constant text[] := array[
    'nirm-allAsgn',
    'nirm-allExtraHrs',
    'nirm-allBrandAsgn'
  ];
  k   text;
  v   jsonb;
  cur jsonb;
begin
  -- Row lock serialises concurrent savers; merges apply in order.
  select a.data into cur from public.app_state a where a.id = 'main' for update;
  if cur is null then
    cur := '{}'::jsonb;
  end if;

  if p_updates is not null then
    for k, v in select * from jsonb_each(p_updates) loop
      if k = any(merge_keys)
         and jsonb_typeof(v) = 'object'
         and jsonb_typeof(coalesce(cur->k, 'null'::jsonb)) = 'object' then
        -- One-level merge: months present in v replace those months only;
        -- months absent from v are preserved. (Within-month cell deletions
        -- still propagate: the month object itself is replaced wholesale.)
        cur := jsonb_set(cur, array[k], (cur->k) || v);
      else
        cur := jsonb_set(cur, array[k], coalesce(v, 'null'::jsonb));
      end if;
    end loop;
  end if;

  if p_deletes is not null then
    foreach k in array p_deletes loop
      cur := cur - k;
    end loop;
  end if;

  update public.app_state
     set data = cur,
         updated_at = now(),
         updated_by = p_updated_by
   where id = 'main';

  return query select a.updated_at from public.app_state a where a.id = 'main';
end
$$;

grant execute on function public.app_state_patch_v2(jsonb, text[], text) to authenticated;
