-- Password Keeper + Brand email groups  (NiRM Service CRM, Nov 2026)
-- Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE.

-- ═══ Brand email groups ═══════════════════════════════════════════════════
-- A saved To + Cc list per brand (several per brand are fine: "Nestlé — stock
-- issue", "Nestlé — refund approval"). Picked from Compose / Reply in the
-- Service CRM so nobody copies the same 12 addresses by hand every time.
create table if not exists public.brand_email_groups (
  id          uuid primary key default gen_random_uuid(),
  brand_id    text references public.brands(id) on delete set null,
  brand       text,                              -- display name snapshot
  name        text not null,
  to_emails   text[] not null default '{}',
  cc_emails   text[] not null default '{}',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists brand_email_groups_brand_idx on public.brand_email_groups (brand_id);
alter table public.brand_email_groups enable row level security;
drop policy if exists brand_email_groups_staff on public.brand_email_groups;
create policy brand_email_groups_staff on public.brand_email_groups
  for all to authenticated using (true) with check (true);

-- ═══ Password Keeper ══════════════════════════════════════════════════════
-- Shop / platform logins per brand. The password is never stored in clear:
-- it is pgp-encrypted with a key that lives in Supabase Vault and is only
-- ever touched inside the two SECURITY DEFINER functions below. The browser
-- cannot read the `secret` column at all (column grant withheld) — it calls
-- cred_reveal(), which also writes an audit row.
create table if not exists public.brand_credentials (
  id          uuid primary key default gen_random_uuid(),
  brand_id    text references public.brands(id) on delete set null,
  brand       text,
  platform    text not null default 'Other',     -- Shopee / Lazada / TikTok Shop / Email / Other
  label       text,                              -- "Seller Centre main", "Sub-account CS"
  username    text,
  secret      bytea,                             -- pgp_sym_encrypt(password, vault key)
  url         text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists brand_credentials_brand_idx on public.brand_credentials (brand_id);
alter table public.brand_credentials enable row level security;
drop policy if exists brand_credentials_staff on public.brand_credentials;
create policy brand_credentials_staff on public.brand_credentials
  for all to authenticated using (true) with check (true);
-- column-level: everyone logged in sees the rows, nobody sees the ciphertext
revoke all on public.brand_credentials from anon, authenticated;
grant select (id, brand_id, brand, platform, label, username, url, note, created_at, updated_at, updated_by),
      delete
  on public.brand_credentials to authenticated;

create table if not exists public.credential_reveals (
  id          bigserial primary key,
  cred_id     uuid references public.brand_credentials(id) on delete cascade,
  user_email  text,
  at          timestamptz not null default now()
);
create index if not exists credential_reveals_cred_idx on public.credential_reveals (cred_id, at desc);
alter table public.credential_reveals enable row level security;
drop policy if exists credential_reveals_read on public.credential_reveals;
create policy credential_reveals_read on public.credential_reveals
  for select to authenticated using (true);

-- the encryption key, created once, stored in Vault
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nirm_cred_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'nirm_cred_key', 'Password Keeper encryption key');
  end if;
end $$;

create or replace function public.cred_key_()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'nirm_cred_key' limit 1
$$;
revoke all on function public.cred_key_() from public, anon, authenticated;

-- upsert; p_password = null/'' keeps the existing password (edit without re-typing)
create or replace function public.cred_save(
  p_id uuid, p_brand_id text, p_brand text, p_platform text, p_label text,
  p_username text, p_password text, p_url text, p_note text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if auth.role() <> 'authenticated' then raise exception 'not allowed'; end if;
  if p_id is null then
    insert into public.brand_credentials (brand_id, brand, platform, label, username, secret, url, note, updated_by)
    values (p_brand_id, p_brand, coalesce(p_platform, 'Other'), p_label, p_username,
            case when p_password is null or p_password = '' then null else pgp_sym_encrypt(p_password, public.cred_key_()) end,
            p_url, p_note, v_who)
    returning id into v_id;
  else
    update public.brand_credentials set
      brand_id = p_brand_id, brand = p_brand, platform = coalesce(p_platform, 'Other'), label = p_label,
      username = p_username, url = p_url, note = p_note, updated_by = v_who, updated_at = now(),
      secret = case when p_password is null or p_password = '' then secret else pgp_sym_encrypt(p_password, public.cred_key_()) end
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.cred_reveal(p_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if auth.role() <> 'authenticated' then raise exception 'not allowed'; end if;
  select pgp_sym_decrypt(secret, public.cred_key_()) into v from public.brand_credentials where id = p_id;
  insert into public.credential_reveals (cred_id, user_email) values (p_id, coalesce(auth.jwt() ->> 'email', 'unknown'));
  return v;
end $$;

revoke all on function public.cred_save(uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.cred_save(uuid,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.cred_reveal(uuid) from public, anon;
grant execute on function public.cred_reveal(uuid) to authenticated;
