-- ════════════════════════════════════════════════════════════════════════════
-- NiRM Roster — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Shared application state ────────────────────────────────────────────
-- One row holds the entire app state as JSON. Simple, works for a 30-person team.
-- If you outgrow this (rarely needed), split into per-month rows later.

create table if not exists public.app_state (
  id          text primary key default 'main',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Seed the single row
insert into public.app_state (id, data) values ('main', '{}'::jsonb)
  on conflict (id) do nothing;

-- ─── 2. User profiles ───────────────────────────────────────────────────────
-- Supabase Auth handles email/password; this table stores app-specific fields
-- (role, display name, payroll info that managers can see).

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null,
  role            text not null check (role in ('viewer','fulltime','manager')),
  display_name    text,
  created_at      timestamptz default now()
);

-- ─── 3. Row Level Security ──────────────────────────────────────────────────
-- Anyone signed in can read app_state. Only fulltime/manager can write.
-- This is enforced server-side; the frontend role check is just UX.

alter table public.app_state enable row level security;
alter table public.profiles  enable row level security;

-- app_state: read for all signed-in, write for fulltime/manager
create policy "Read app_state for signed-in users"
  on public.app_state for select
  to authenticated
  using (true);

create policy "Write app_state for fulltime and manager"
  on public.app_state for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('fulltime','manager')
    )
  );

-- profiles: anyone signed in can read all profiles (needed for assignment UI);
-- users can update their own; managers can update anyone.
create policy "Read profiles for signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "Managers can update any profile"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

create policy "Managers can insert profiles"
  on public.profiles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

create policy "Managers can delete profiles"
  on public.profiles for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

-- ─── 4. Realtime — broadcast app_state changes to all clients ───────────────
-- So when Prim updates the roster, Vee's browser sees the change immediately.
alter publication supabase_realtime add table public.app_state;

-- ─── 4b. Storage policies — payroll-docs bucket ─────────────────────────────
-- The invite link is used by new agents BEFORE they have a Supabase Auth login,
-- so the profile photo / ID card / bookbank uploads happen as the anon role.
-- These policies allow anon + authenticated to upload, read, and update files
-- inside the payroll-docs bucket only. Other buckets remain locked down.
--
-- NOTE: Before running these, create the bucket in Supabase Dashboard →
-- Storage → "New bucket" → name = payroll-docs, Public = ON.

drop policy if exists "payroll_docs_anon_upload" on storage.objects;
drop policy if exists "payroll_docs_anon_update" on storage.objects;
drop policy if exists "payroll_docs_anon_read"   on storage.objects;

create policy "payroll_docs_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'payroll-docs');

create policy "payroll_docs_anon_update"
  on storage.objects for update
  to anon
  using (bucket_id = 'payroll-docs')
  with check (bucket_id = 'payroll-docs');

create policy "payroll_docs_anon_read"
  on storage.objects for select
  to anon
  using (bucket_id = 'payroll-docs');

-- ─── 5. Helper trigger: keep updated_at fresh ───────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
  before update on public.app_state
  for each row execute function public.touch_updated_at();
