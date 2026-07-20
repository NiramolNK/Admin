-- Generic inbox for non-TikTok SVCR channels (LINE OA, Email, future Amaze).
-- TikTok keeps its own tk_messages table (already live) — this is separate.
-- Applied live via Supabase MCP on 2026-07-20 (version 20260720095547);
-- this file mirrors it locally so the migrations folder stays authoritative.
create table if not exists public.channel_messages (
  id bigint generated always as identity primary key,
  channel_key text not null,        -- 'line_oa' | 'email' | 'amaze'
  account_id text not null,         -- LINE channel id, or mailbox address, etc.
  conversation_id text,             -- LINE userId, or email thread/from-address
  message_id text not null,
  direction text not null default 'in',  -- 'in' from customer, 'out' from brand
  user_ref text,                    -- display name / email address shown in UI
  text text,
  message_time timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (channel_key, message_id)
);

create index if not exists channel_messages_lookup_idx
  on public.channel_messages (channel_key, account_id, message_time desc);

alter table public.channel_messages enable row level security;
-- No policies: only the service-role key (used by edge functions) can read/write.
