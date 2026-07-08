-- kv_snapshots — automatic version history for every NiRM data key
-- =====================================================================
-- WHY: on 2026-07-08 the July brand allocation was wiped by a storage-
-- layer race and was UNRECOVERABLE because nothing archived old values.
-- This adds a Postgres trigger that snapshots the PREVIOUS value of a
-- kv_state row every time it changes — no client code involved, so it
-- catches every write path: the app, REST scripts, and the SQL console.
--
-- Recovery is then always possible:
--   select * from kv_snapshots where key='nirm-allBrandAsgn'
--   order by saved_at desc;               -- pick the version you want
--   update kv_state set value = (select value from kv_snapshots where id=<ID>),
--          version = version + 1
--    where key = 'nirm-allBrandAsgn';     -- restore it
--
-- Retention: newest 50 snapshots per key (~a few weeks of history at
-- normal edit rates). Excluded: high-churn/no-value keys (prefs, role)
-- and the dead legacy blob (nirm-all).
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run. Does not touch existing data.

create table if not exists public.kv_snapshots (
  id       bigint generated always as identity primary key,
  key      text not null,
  value    jsonb,
  version  bigint,
  saved_at timestamptz not null default now()
);

create index if not exists kv_snapshots_key_time
  on public.kv_snapshots (key, saved_at desc);

-- Read-only via the API: authenticated users can SELECT (needed for
-- recovery tooling); no insert/update/delete policies exist, so the API
-- cannot tamper with history. The trigger function below writes as owner.
alter table public.kv_snapshots enable row level security;
drop policy if exists kv_snapshots_read on public.kv_snapshots;
create policy kv_snapshots_read on public.kv_snapshots
  for select to authenticated using (true);

create or replace function public.kv_snapshot_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keep constant int := 50;  -- newest snapshots kept per key
begin
  if OLD.value is distinct from NEW.value
     and OLD.key not in ('nirm-prefs', 'nirm-role', 'nirm-all') then
    insert into public.kv_snapshots(key, value, version)
    values (OLD.key, OLD.value, OLD.version);

    -- retention: prune beyond the newest `keep` snapshots for this key
    delete from public.kv_snapshots s
     where s.key = OLD.key
       and s.id not in (
         select id from public.kv_snapshots
          where key = OLD.key
          order by saved_at desc, id desc
          limit keep
       );
  end if;
  return NEW;
end
$$;

drop trigger if exists kv_snapshot_trigger on public.kv_state;
create trigger kv_snapshot_trigger
  before update on public.kv_state
  for each row execute function public.kv_snapshot_on_change();
