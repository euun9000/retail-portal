-- Supabase SQL Editor에 그대로 붙여넣고 Run을 누르세요.

create table if not exists public.tkey_state (
  id text primary key default 'default',
  connected boolean not null default false,
  connected_user text default '',
  current_state text default '대기',
  last_keep_alive_at text,
  last_sync_at text,
  last_wireless_count integer default 0,
  last_wired_count integer default 0,
  sync_logs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.tkey_state (id, connected)
values ('default', false)
on conflict (id) do nothing;

create table if not exists public.performance_cache (
  kind text primary key, -- 'wireless' | 'wired'
  rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.performance_cache (kind, rows, row_count)
values ('wireless', '[]'::jsonb, 0), ('wired', '[]'::jsonb, 0)
on conflict (kind) do nothing;
