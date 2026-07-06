-- ════════════════════════════════════════════════════════════════════
-- NiRM ONE-SHOT SETUP  (v3 — April's official team sheet, PCodes 01-17)
-- Run ONCE in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- PART 1: two-way mirror  agents/brands/brand_assignments <-> app data
-- PART 2: team spec — PCode ids, full names, emails, shifts, days,
--         rates; renames agent ids to official PCodes AND rewrites all
--         roster assignment keys so no history is lost; creates missing
--         agents; repairs the earlier Mark(T2) mistake if present.
-- PART 3: verify output
--
-- NOTE: sheet lists two agents nicknamed "Cream" (06 Darawadee,
-- 14 Chanidsara). Assignments reference agents BY NAME, so identical
-- nicknames would mix their allocations. #14 is kept as "Cream Chanid".
-- ════════════════════════════════════════════════════════════════════

-- ── PART 1 ── mirror tables ──────────────────────────────────────────
drop table if exists public.agents cascade;
create table public.agents (
  id        text primary key,
  name      text,
  team      text,
  active    boolean,
  shifts    jsonb,
  days      jsonb,
  cost_day  numeric,
  email     text,
  full_name text,
  raw       jsonb
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
    insert into public.agents (id,name,team,active,shifts,days,cost_day,email,full_name,raw)
    select e->>'id', e->>'name', e->>'team',
           coalesce((e->>'active')::boolean, true),
           e->'shifts', e->'days',
           nullif(e->>'costDay','')::numeric, e->>'email', e->>'fullName', e
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
      'shifts',shifts,'days',days,'costDay',cost_day,'email',email,'fullName',full_name))
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

-- ── PART 2 ── official team sheet (PCodes 01-17) ─────────────────────
-- Days: Mon-Fri=[1,2,3,4,5]  Mon-Sun=[1,2,3,4,5,6,0]  Mon-Sat=[1,2,3,4,5,6]
create temp table team_spec (
  pcode text, nick text, full_name text, team text,
  shifts jsonb, days jsonb, cost numeric, email text
);
insert into team_spec values
('01','Ohm','Mr. Sarayut Chantrai','T1','["M"]','[1,2,3,4,5]',500,'sarayut.c@crea.asia'),
('02','Joy','Ms. Nitcha Klomsunthon','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',500,'nattakran.k@crea.asia'),
('03','Boo','Ms. Sirinan Choopan','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'sirinan.c@crea.asia'),
('04','Best','Mr. Teinvithit Srinam','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',500,'teinvithit.s@crea.asia'),
('05','KhaoPun','Ms. Sirinya Sangngarmplung','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',500,'lzdextcs.07@crea.asia'),
('06','Cream','Ms. Darawadee Audomrat','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'darawadee.a@crea.asia'),
('07','Daran','Ms. Daran Leesakunruk','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'daran.p@crea.asia'),
('08','Ploy','Ms. Pheerapat Kuayniam','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'pheerapat.k@crea.asia'),
('09','Aof','Mr. Supichak Rajchasic','Return','["M"]','[1,2,3,4,5,6]',600,'customerservice.extrtrf@crea.asia'),
('10','Poi','Ms. Siwaporn Arnat','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'siwaporn.a@crea.asia'),
('11','Gyp','Ms. Kawisara Boriboon','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'kawisara.b@crea.asia'),
('12','Otar','Ms. Supanida Chamchoi','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'supanida.c@crea.asia'),
('13','Nan','Ms. Napattanan Pomark','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'napattanan.p@crea.asia'),
('14','Cream Chanid','Mr. Chanidsara Janthima','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'chanidsara.j@crea.asia'),
('15','Marker','Mr. Chakrit Suksirikul','CC','["M"]','[1,2,3,4,5,6]',600,'chakrit.s@crea.asia'),
('16','Earn','Ms. Bunyarat Julmana','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'bunyarat.j@crea.asia'),
('17','Mint','Ms. Sasitorn Onwong','T1','["M","ME","E"]','[1,2,3,4,5,6,0]',400,'sasitorn.o@crea.asia');

-- current agents from the app
create temp table cur_agents as
select e, lower(coalesce(e->>'name','')) as nick_l, e->>'id' as old_id
from public.kv_state, jsonb_array_elements(coalesce(value->'v', value)) e
where key = 'nirm-agents';

-- match by nickname; 'gyb' is the old spelling of Gyp
create temp table matched as
select c.old_id, s.*
from cur_agents c
join team_spec s
  on c.nick_l = lower(s.nick)
  or (s.nick = 'Gyp' and c.nick_l = 'gyb');

-- id rename map (only where the id actually changes)
create temp table id_map as
select old_id, pcode as new_id from matched where old_id is distinct from pcode;

-- build the new agents array:
--   matched agents -> merged with spec (id becomes PCode)
--   Mark(T2) repair -> strip wrong chakrit email if the old script set it
--   unmatched agents (T2 team etc.) -> unchanged
--   spec rows with no current agent -> created fresh
create temp table new_agents_json as
select coalesce(jsonb_agg(obj order by obj->>'id'), '[]'::jsonb) as j from (
  select case
    when m.pcode is not null then
      c.e || jsonb_build_object(
        'id', m.pcode, 'name', m.nick, 'fullName', m.full_name,
        'team', m.team, 'shifts', m.shifts, 'days', m.days,
        'costDay', m.cost, 'email', m.email, 'active', true)
    when c.nick_l = 'mark' and c.e->>'email' = 'chakrit.s@crea.asia' then
      (c.e - 'email') || '{"team":"T2"}'::jsonb
    else c.e
  end as obj
  from cur_agents c
  left join matched m on m.old_id = c.old_id
  union all
  select jsonb_build_object(
    'id', s.pcode, 'name', s.nick, 'fullName', s.full_name,
    'team', s.team, 'active', true, 'shifts', s.shifts, 'days', s.days,
    'costDay', s.cost, 'rule', '', 'email', s.email)
  from team_spec s
  where not exists (select 1 from matched m where m.pcode = s.pcode)
) u;

select public.nirm_write_kv('nirm-agents', (select j from new_agents_json));

-- rewrite roster assignment keys "<agentId>_<YYYY-MM-DD>" to the new PCodes
-- so existing schedules stay attached to the renamed agents
update public.kv_state
set version = version + 1,
    value = (
      with src as (
        select coalesce(value->'v', value) as v, (value ? '__wasString') as w
        from public.kv_state where key = 'nirm-allAsgn'
      ),
      rewritten as (
        select coalesce(jsonb_object_agg(mk, mo), '{}'::jsonb) as v2 from (
          select m.key as mk,
            coalesce(jsonb_object_agg(
              coalesce(im.new_id, substring(a.key from '^(.*)_\d{4}-\d{2}-\d{2}$'))
                || substring(a.key from '(_\d{4}-\d{2}-\d{2})$'),
              a.value), '{}'::jsonb) as mo
          from src, jsonb_each(src.v) m, jsonb_each(m.value) a
          left join id_map im
            on im.old_id = substring(a.key from '^(.*)_\d{4}-\d{2}-\d{2}$')
          group by m.key
        ) s
      )
      select case when src.w
        then jsonb_set(kv_state.value, '{v}', rewritten.v2)
        else rewritten.v2 end
      from src, rewritten
    )
where key = 'nirm-allAsgn'
  and exists (select 1 from id_map);

-- ── PART 3 ── initial mirror fill + verify ───────────────────────────
update public.kv_state set updated_at = now()
where key in ('nirm-brands','nirm-allBrandAsgn');

select e->>'id' as pcode, e->>'name' as nick, e->>'fullName' as full_name,
       e->>'team' as team, e->'shifts' as shifts, e->'days' as days,
       e->>'costDay' as rate, e->>'email' as email
from public.kv_state, jsonb_array_elements(coalesce(value->'v', value)) e
where key = 'nirm-agents'
order by e->>'team', e->>'id';
