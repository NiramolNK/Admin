-- NiRM Roster - data-loss fix migration
-- Run ONCE in Supabase -> SQL Editor -> New query -> Run
-- Per-key, versioned KV table: concurrent saves can never silently
-- overwrite each other (compare-and-swap on version).
-- App auto-migrates old app_state.data blob on first boot.

create table if not exists public.kv_state (
  key        text primary key,
  value      jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.kv_state enable row level security;

drop policy if exists "kv read for authenticated" on public.kv_state;
create policy "kv read for authenticated"
  on public.kv_state for select
  to authenticated using (true);

drop policy if exists "kv insert for authenticated" on public.kv_state;
create policy "kv insert for authenticated"
  on public.kv_state for insert
  to authenticated with check (true);

drop policy if exists "kv update for authenticated" on public.kv_state;
create policy "kv update for authenticated"
  on public.kv_state for update
  to authenticated using (true) with check (true);

drop policy if exists "kv delete for authenticated" on public.kv_state;
create policy "kv delete for authenticated"
  on public.kv_state for delete
  to authenticated using (true);

create or replace function public.touch_kv_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kv_updated_at on public.kv_state;
create trigger trg_kv_updated_at
  before update on public.kv_state
  for each row execute function public.touch_kv_updated_at();

alter publication supabase_realtime add table public.kv_state;
