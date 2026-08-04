-- webchat channel for SVCR Service Desk — run once in Supabase SQL editor
create table if not exists webchat_messages (
  id           bigint generated always as identity primary key,
  brand        text not null,
  session      text not null,             -- widget localStorage session id
  direction    text not null check (direction in ('in','out')),
  visitor_name text,
  body         text not null,
  page         text,                      -- URL the visitor chatted from
  meta         jsonb not null default '{}'::jsonb,  -- shopify ctx etc.
  created_at   timestamptz not null default now()
);
create index if not exists idx_webchat_session on webchat_messages (session, created_at);
create index if not exists idx_webchat_brand   on webchat_messages (brand, direction, created_at desc);

-- table is accessed only by the webchat edge function (service role);
-- lock it away from anon/authenticated clients entirely
alter table webchat_messages enable row level security;
