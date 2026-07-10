-- kv_guard — server-side rejection of suspicious data wipes
-- =====================================================================
-- WHY: allBrandAsgn was wiped twice (2026-07-08, 2026-07-10) by stale
-- browser tabs running old app code. Client-side fixes can't reach tabs
-- that never reload — but the SERVER sees every write. This trigger
-- refuses any write that shrinks a protected key to under 10% of its
-- previous size — a wipe pattern no legitimate edit produces.
--
-- Legit large edits pass: clearing ONE month of six (~-17%), Fill All
-- (similar size), normal edits (grow/shrink slightly). Small keys
-- (< 1000 chars) are exempt so a fresh install can't get stuck.
--
-- Intentional mass deletion (admin ops) goes through kv_force_set().
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run.

create or replace function public.kv_guard_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  protected constant text[] := array[
    'nirm-allAsgn', 'nirm-allBrandAsgn', 'nirm-allExtraHrs',
    'nirm-agents', 'nirm-brands', 'nirm-userAccounts',
    'nirm-userProfiles', 'nirm-monthlyVol', 'nirm-fulltimeSalary',
    'nirm-agentPerf', 'nirm-changeRequests'
  ];
  old_len int;
  new_len int;
begin
  if OLD.key = any(protected)
     and coalesce(current_setting('nirm.allow_shrink', true), '') <> '1' then
    old_len := length(coalesce(OLD.value::text, ''));
    new_len := length(coalesce(NEW.value::text, ''));
    if old_len > 1000 and new_len < old_len / 10 then
      raise exception 'kv_guard: refusing suspicious shrink of % (% -> % chars). If intentional, use kv_force_set().',
        OLD.key, old_len, new_len;
    end if;
  end if;
  return NEW;
end
$$;

drop trigger if exists kv_guard_trigger on public.kv_state;
create trigger kv_guard_trigger
  before update on public.kv_state
  for each row execute function public.kv_guard_on_update();
-- Note: runs before kv_snapshot_trigger (alphabetical order), so a
-- rejected write archives nothing and changes nothing.

-- Admin escape hatch for INTENTIONAL mass deletions (e.g. purging a
-- placeholder month). Sets the bypass flag for this transaction only.
create or replace function public.kv_force_set(p_key text, p_value jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_version bigint;
begin
  perform set_config('nirm.allow_shrink', '1', true);  -- this txn only
  update public.kv_state
     set value = p_value,
         version = version + 1,
         updated_at = now()
   where key = p_key
  returning version into new_version;
  return new_version;
end
$$;

grant execute on function public.kv_force_set(text, jsonb) to authenticated;
