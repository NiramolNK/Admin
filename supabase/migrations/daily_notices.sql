-- Today's notes (NiRM, Nov 2026): a notice managers post for the team.
-- Safe to re-run.
create table if not exists public.daily_notices (
  id           uuid primary key default gen_random_uuid(),
  for_date     date not null default (now() at time zone 'Asia/Bangkok')::date,
  until_date   date,                              -- null = that day only
  body         text not null,
  author_email text,
  author_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists daily_notices_date_idx on public.daily_notices (for_date desc);
alter table public.daily_notices enable row level security;

-- everyone signed in can read; only managers write.
-- NiRM keeps the role in public.profiles (id = auth user id, role = 'manager').
create or replace function public.nirm_is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
$$;
grant execute on function public.nirm_is_manager() to authenticated;

drop policy if exists daily_notices_read  on public.daily_notices;
drop policy if exists daily_notices_write on public.daily_notices;
create policy daily_notices_read  on public.daily_notices for select to authenticated using (true);
create policy daily_notices_write on public.daily_notices for all    to authenticated
  using (public.nirm_is_manager()) with check (public.nirm_is_manager());

-- 12 Nov 2026: tag each note with a brand and a reason (applied live 12 Nov)
alter table public.daily_notices add column if not exists brand text;
alter table public.daily_notices add column if not exists reason text;
