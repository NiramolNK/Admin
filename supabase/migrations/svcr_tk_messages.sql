-- tk_messages: TikTok Business Messaging inbox for SVCR Service Desk
-- Run in Supabase SQL Editor (project bequrilwgooesolepubv) before
-- deploying the tiktok-messaging edge function.

create table if not exists public.tk_messages (
  id bigint generated always as identity primary key,
  business_id text not null,
  conversation_id text,
  message_id text unique,
  direction text not null default 'in', -- 'in' from customer, 'out' from brand
  user_open_id text,
  username text,
  text text,
  message_time timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tk_messages_biz_time_idx
  on public.tk_messages (business_id, message_time desc);

-- Lock down: no anon/authenticated access. The edge functions use the
-- service role key, which bypasses RLS. NiRM's kv_state is untouched.
alter table public.tk_messages enable row level security;
