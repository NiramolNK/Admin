-- ════════════════════════════════════════════════════════════════════
-- NiRM two-way mirror: agents / brands / brand_assignments  <->  kv_state
-- Run ONCE in Supabase SQL Editor.
--
-- BEFORE: the agents/brands/brand_assignments tables were connected to
-- nothing (leftover copies). The app's real data lives in kv_state.
-- AFTER: the tables become LIVE mirrors. Edit in the app -> tables
-- update instantly. Edit a table row in Supabase -> app data updates
-- (refresh the app tab to see it).
--
-- NOTE: current contents of those three tables are stale leftovers and
-- will be REPLACED by the app's real data at the end of this script.
-- ════════════════════════════════════════════════════════════════════

-- 1 ── rebuild mirror tables in a canonical shape ──────────────────────
drop table if exists public.agents cascade;
create table public.agents (
  id       text primary key,
  name     text,
  team     text,
  active   boolean,
  shifts   jsonb,
  days     jsonb,
  cost_day numeric,
  email    text,
  raw      jsonb  -- full original object; keeps fields not shown as columns
);

drop table if exists public.brands cascade;
create table public.brands (
  id         text primary key,
  name       text,
  "group"    text,
  wh         text,
  platforms  jsonb,
  offboarded boolean,
  start_date text,
  raw        jsonb
);

drop table if exists public.brand_assignments cascade;
create table public.brand_assignments (
  month    text,
  k        text,
  brand_id text,
  date     text,
  shift    text,
  platform text,
  agents   jsonb,
  primary key (month, k)
);

-- RLS: any signed-in team member can read/write (same as kv_state)
alter table public.agents enable row level security;
alter table public.brands enable row level security;
alter table public.brand_assignments enable row level security;
create policy "auth all agents" on public.agents for all to authenticated using (true) with check (true);
create policy "auth all brands" on public.brands for all to authenticated using (true) with check (true);
create policy "auth all asgn"   on public.brand_assignments for all to authenticated using (true) with check (true);

-- 2 ── kv_state -> tables (app edits flow into the tables) ─────────────
create or replace function public.nirm_kv_to_tables()
returns trigger language plpgsql security definer as $$
declare v jsonb;
begin
  if current_setting('nirm.sync', true) = '1' then return new; end if;
  perform set_config('nirm.sync', '1', true);
  v := coalesce(new.value->'v', new.value);

  if new.key = 'nirm-agents' then
    delete from public.agents;
    insert into public.agents (id,name,team,active,shifts,days,cost_day,email,raw)
    select e->>'id', e->>'name', e->>'team',
           coalesce((e->>'active')::boolean, true),
           e->'shifts', e->'days',
           nullif(e->>'costDay','')::numeric, e->>'email', e
    from jsonb_array_elements(v) e;

  elsif new.key = 'nirm-brands' then
    delete from public.brands;
    insert into public.brands (id,name,"group",wh,platforms,offboarded,start_date,raw)
    select e->>'id', e->>'name', e->>'group', e->>'wh', e->'platforms',
           coalesce((e->>'offboarded')::boolean, false), e->>'startDate', e
    from jsonb_array_elements(v) e;

  elsif new.key = 'nirm-allBrandAsgn' then
    delete from public.brand_assignments;
    insert into public.brand_assignments (month,k,brand_id,date,shift,platform,agents)
    select m.key, a.key,
           split_part(a.key,'_',1), split_part(a.key,'_',2),
           split_part(a.key,'_',3), split_part(a.key,'_',4),
           a.value
    from jsonb_each(v) m, jsonb_each(m.value) a;
  end if;
  return new;
end $$;

drop trigger if exists trg_nirm_kv_to_tables on public.kv_state;
create trigger trg_nirm_kv_to_tables
  after insert or update on public.kv_state
  for each row
  when (new.key in ('nirm-agents','nirm-brands','nirm-allBrandAsgn'))
  execute function public.nirm_kv_to_tables();

-- 3 ── tables -> kv_state (Supabase edits flow back into the app) ──────
create or replace function public.nirm_write_kv(kv_key text, new_json jsonb)
returns void language plpgsql security definer as $$
declare cur jsonb; cur_inner jsonb;
begin
  select value into cur from public.kv_state where key = kv_key;
  cur_inner := coalesce(cur->'v', cur);
  -- Shrink guard: never wipe app data because a table was emptied by accident
  if (new_json = '[]'::jsonb or new_json = '{}'::jsonb)
     and cur_inner is not null
     and cur_inner not in ('[]'::jsonb, '{}'::jsonb) then
    raise notice 'nirm mirror: refusing to overwrite % with empty data', kv_key;
    return;
  end if;
  update public.kv_state
  set value = case when value ? '__wasString'
                   then jsonb_set(value, '{v}', new_json)
                   else new_json end,
      version = version + 1
  where key = kv_key;
end $$;

create or replace function public.nirm_agents_to_kv()
returns trigger language plpgsql security definer as $$
declare j jsonb;
begin
  if current_setting('nirm.sync', true) = '1' then return null; end if;
  perform set_config('nirm.sync', '1', true);
  select coalesce(jsonb_agg(
    coalesce(raw,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'id',id,'name',name,'team',team,'active',active,
      'shifts',shifts,'days',days,'costDay',cost_day,'email',email))
    order by id), '[]'::jsonb)
  into j from public.agents;
  perform public.nirm_write_kv('nirm-agents', j);
  return null;
end $$;

create or replace function public.nirm_brands_to_kv()
returns trigger language plpgsql security definer as $$
declare j jsonb;
begin
  if current_setting('nirm.sync', true) = '1' then return null; end if;
  perform set_config('nirm.sync', '1', true);
  select coalesce(jsonb_agg(
    coalesce(raw,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'id',id,'name',name,'group',"group",'wh',wh,
      'platforms',platforms,'offboarded',offboarded,'startDate',start_date))
    order by id), '[]'::jsonb)
  into j from public.brands;
  perform public.nirm_write_kv('nirm-brands', j);
  return null;
end $$;

create or replace function public.nirm_asgn_to_kv()
returns trigger language plpgsql security definer as $$
declare j jsonb;
begin
  if current_setting('nirm.sync', true) = '1' then return null; end if;
  perform set_config('nirm.sync', '1', true);
  select coalesce(jsonb_object_agg(month, mo), '{}'::jsonb) into j
  from ( select month, jsonb_object_agg(k, agents) mo
         from public.brand_assignments group by month ) s;
  perform public.nirm_write_kv('nirm-allBrandAsgn', j);
  return null;
end $$;

drop trigger if exists trg_agents_to_kv on public.agents;
create trigger trg_agents_to_kv
  after insert or update or delete on public.agents
  for each statement execute function public.nirm_agents_to_kv();

drop trigger if exists trg_brands_to_kv on public.brands;
create trigger trg_brands_to_kv
  after insert or update or delete on public.brands
  for each statement execute function public.nirm_brands_to_kv();

drop trigger if exists trg_asgn_to_kv on public.brand_assignments;
create trigger trg_asgn_to_kv
  after insert or update or delete on public.brand_assignments
  for each statement execute function public.nirm_asgn_to_kv();

-- 4 ── initial fill: pull the app's real data into the tables now ──────
update public.kv_state set updated_at = now()
where key in ('nirm-agents','nirm-brands','nirm-allBrandAsgn');

-- 5 ── verify ──────────────────────────────────────────────────────────
select 'agents' t, count(*) from public.agents
union all select 'brands', count(*) from public.brands
union all select 'brand_assignments', count(*) from public.brand_assignments;


-- ════════════════════════════════════════════════════════════════════
-- PART 2 — Link team emails to agent records + set Mark as CC
-- Fixes "No personal schedule linked" for everyone whose agent record
-- matches by name. Runs AFTER Part 1 so the new mirror triggers fire
-- and the agents table updates automatically.
-- ════════════════════════════════════════════════════════════════════

create or replace function pg_temp.nirm_link(e jsonb) returns jsonb
language sql as $$
  select case lower(coalesce(e->>'name',''))
    when 'prim'    then e || '{"email":"prim.v@crea.asia"}'::jsonb
    when 'ohm'     then e || '{"email":"sarayut.c@crea.asia"}'::jsonb
    when 'joy'     then e || '{"email":"nattakran.k@crea.asia"}'::jsonb
    when 'boo'     then e || '{"email":"sirinan.c@crea.asia"}'::jsonb
    when 'best'    then e || '{"email":"teinvithit.s@crea.asia"}'::jsonb
    when 'khaopun' then e || '{"email":"lzdextcs.07@crea.asia"}'::jsonb
    when 'cream'   then e || '{"email":"darawadee.a@crea.asia"}'::jsonb
    when 'ploy'    then e || '{"email":"pheerapat.k@crea.asia"}'::jsonb
    when 'ploy d'  then e || '{"email":"daran.p@crea.asia"}'::jsonb
    when 'aof'     then e || '{"email":"customerservice.extrtrf@crea.asia"}'::jsonb
    when 'mark'    then e || '{"email":"chakrit.s@crea.asia","team":"CC","shifts":["M"],"days":[1,2,3,4,5,6]}'::jsonb
    else e
  end
$$;

update public.kv_state
set version = version + 1,
    value = case when value ? '__wasString'
      then jsonb_set(value, '{v}',
        (select jsonb_agg(pg_temp.nirm_link(e)) from jsonb_array_elements(value->'v') e))
      else
        (select jsonb_agg(pg_temp.nirm_link(e)) from jsonb_array_elements(value) e)
    end
where key = 'nirm-agents';

-- verify: every agent with a linked email
select e->>'name' as agent, e->>'team' as team, e->>'email' as email
from public.kv_state, jsonb_array_elements(coalesce(value->'v', value)) e
where key = 'nirm-agents'
order by e->>'name';


-- ════════════════════════════════════════════════════════════════════
-- PART 3 — Create agent records for team members that have none
-- (Cream Chanid, Poi, Gyb, Otar, Nan, Earn, Mint — all T1)
-- Idempotent: skips anyone whose name already exists, so re-running
-- this file never creates duplicates. Emails pre-linked, all shifts,
-- all days. costDay starts at 0 — FILL REAL DAILY COST in Teams tab
-- or payroll for these agents will calculate as zero.
-- ════════════════════════════════════════════════════════════════════

with cur as (
  select coalesce(value->'v', value) as v
  from public.kv_state where key = 'nirm-agents'
),
newbies as (
  select jsonb_array_elements('[
    {"id":"a_creamchanid","name":"Cream Chanid","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"chanidsara.j@crea.asia"},
    {"id":"a_poi","name":"Poi","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"siwaporn.a@crea.asia"},
    {"id":"a_gyb","name":"Gyb","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"kawisara.b@crea.asia"},
    {"id":"a_otar","name":"Otar","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"supanida.c@crea.asia"},
    {"id":"a_nan","name":"Nan","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"napattanan.p@crea.asia"},
    {"id":"a_earn","name":"Earn","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"bunyarat.j@crea.asia"},
    {"id":"a_mint","name":"Mint","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":0,"rule":"","email":"sasitorn.o@crea.asia"}
  ]'::jsonb) as e
),
missing as (
  select e from newbies
  where not exists (
    select 1 from cur, jsonb_array_elements(cur.v) x
    where lower(x->>'name') = lower(e->>'name')
  )
)
update public.kv_state
set version = version + 1,
    value = case when value ? '__wasString'
      then jsonb_set(value, '{v}',
        (select v from cur) || coalesce((select jsonb_agg(e) from missing), '[]'::jsonb))
      else
        (select v from cur) || coalesce((select jsonb_agg(e) from missing), '[]'::jsonb)
    end
where key = 'nirm-agents'
  and exists (select 1 from missing);

-- final verify: full team with emails and teams
select e->>'name' as agent, e->>'team' as team, e->>'email' as email,
       e->>'costDay' as cost_day
from public.kv_state, jsonb_array_elements(coalesce(value->'v', value)) e
where key = 'nirm-agents'
order by e->>'team', e->>'name';
