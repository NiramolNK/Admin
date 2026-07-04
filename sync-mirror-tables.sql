-- ════════════════════════════════════════════════════════════════════
-- NiRM ONE-SHOT SETUP  (v2 — spec-driven, per April's team sheet)
-- Run ONCE in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- PART 1: two-way mirror  agents/brands/brand_assignments <-> app data
-- PART 2: team spec — per-person email, shifts, days, rate; creates
--         missing agents (Daran, Poi, Gyb, Otar, Nan, Earn, Mint,
--         Cream Chanid, Marker); repairs Mark(T2) if a previous
--         version of this script converted him by mistake.
-- PART 3: verify output
-- ════════════════════════════════════════════════════════════════════

-- ── PART 1 ── mirror tables ──────────────────────────────────────────
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
  raw      jsonb
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

alter table public.agents enable row level security;
alter table public.brands enable row level security;
alter table public.brand_assignments enable row level security;
create policy "auth all agents" on public.agents for all to authenticated using (true) with check (true);
create policy "auth all brands" on public.brands for all to authenticated using (true) with check (true);
create policy "auth all asgn"   on public.brand_assignments for all to authenticated using (true) with check (true);

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

create or replace function public.nirm_write_kv(kv_key text, new_json jsonb)
returns void language plpgsql security definer as $$
declare cur jsonb; cur_inner jsonb;
begin
  select value into cur from public.kv_state where key = kv_key;
  cur_inner := coalesce(cur->'v', cur);
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

-- ── PART 2 ── team spec (April's sheet is the source of truth) ───────
-- Days: Mon-Fri=[1,2,3,4,5]  Everyday=[1,2,3,4,5,6,0]
--       Sat-Sun=[6,0]        Mon-Sat=[1,2,3,4,5,6]

-- 2a. update existing agents by name (merge spec fields)
create or replace function pg_temp.nirm_spec(e jsonb) returns jsonb
language sql as $$
  select case lower(coalesce(e->>'name',''))
    when 'ohm'      then e || '{"email":"sarayut.c@crea.asia","shifts":["M"],"days":[1,2,3,4,5],"costDay":500}'::jsonb
    when 'joy'      then e || '{"email":"nattakran.k@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":500}'::jsonb
    when 'boo'      then e || '{"email":"sirinan.c@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'khaopun'  then e || '{"email":"lzdextcs.07@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":500}'::jsonb
    when 'best'     then e || '{"email":"teinvithit.s@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":500}'::jsonb
    when 'cream'    then e || '{"email":"darawadee.a@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'ploy'     then e || '{"email":"pheerapat.k@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'aof'      then e || '{"email":"customerservice.extrtrf@crea.asia","shifts":["M"],"days":[1,2,3,4,5,6],"costDay":600}'::jsonb
    when 'prim'     then e || '{"email":"prim.v@crea.asia"}'::jsonb
    -- repair: undo the earlier mistaken Mark(T2) -> CC conversion, if it ran
    when 'mark'     then case when e->>'email' = 'chakrit.s@crea.asia'
                              then (e - 'email') || '{"team":"T2"}'::jsonb
                              else e end
    -- correct any agents created by the earlier script version
    when 'daran'        then e || '{"email":"daran.p@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'poi'          then e || '{"email":"siwaporn.a@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'gyb'          then e || '{"email":"kawisara.b@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'otar'         then e || '{"email":"supanida.c@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'nan'          then e || '{"email":"napattanan.p@crea.asia","shifts":["M","ME","E"],"days":[6,0],"costDay":400}'::jsonb
    when 'earn'         then e || '{"email":"bunyarat.j@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'mint'         then e || '{"email":"sasitorn.o@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'cream chanid' then e || '{"email":"chanidsara.j@crea.asia","shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400}'::jsonb
    when 'marker'       then e || '{"email":"chakrit.s@crea.asia","team":"CC","shifts":["M"],"days":[1,2,3,4,5,6],"costDay":600}'::jsonb
    else e
  end
$$;

update public.kv_state
set version = version + 1,
    value = case when value ? '__wasString'
      then jsonb_set(value, '{v}',
        (select jsonb_agg(pg_temp.nirm_spec(e)) from jsonb_array_elements(value->'v') e))
      else
        (select jsonb_agg(pg_temp.nirm_spec(e)) from jsonb_array_elements(value) e)
    end
where key = 'nirm-agents';

-- 2b. create agents that don't exist yet (idempotent by name)
with cur as (
  select coalesce(value->'v', value) as v
  from public.kv_state where key = 'nirm-agents'
),
newbies as (
  select jsonb_array_elements('[
    {"id":"a_daran","name":"Daran","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"daran.p@crea.asia"},
    {"id":"a_poi","name":"Poi","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"siwaporn.a@crea.asia"},
    {"id":"a_gyb","name":"Gyb","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"kawisara.b@crea.asia"},
    {"id":"a_otar","name":"Otar","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"supanida.c@crea.asia"},
    {"id":"a_nan","name":"Nan","team":"T1","active":true,"shifts":["M","ME","E"],"days":[6,0],"costDay":400,"rule":"","email":"napattanan.p@crea.asia"},
    {"id":"a_earn","name":"Earn","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"bunyarat.j@crea.asia"},
    {"id":"a_mint","name":"Mint","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"sasitorn.o@crea.asia"},
    {"id":"a_creamchanid","name":"Cream Chanid","team":"T1","active":true,"shifts":["M","ME","E"],"days":[1,2,3,4,5,6,0],"costDay":400,"rule":"","email":"chanidsara.j@crea.asia"},
    {"id":"a_marker","name":"Marker","team":"CC","active":true,"shifts":["M"],"days":[1,2,3,4,5,6],"costDay":600,"rule":"","email":"chakrit.s@crea.asia"}
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

-- ── PART 3 ── initial mirror fill + verify ───────────────────────────
update public.kv_state set updated_at = now()
where key in ('nirm-brands','nirm-allBrandAsgn');

select e->>'name' as agent, e->>'team' as team, e->>'email' as email,
       e->'shifts' as shifts, e->'days' as days, e->>'costDay' as rate
from public.kv_state, jsonb_array_elements(coalesce(value->'v', value)) e
where key = 'nirm-agents'
order by e->>'team', e->>'name';
