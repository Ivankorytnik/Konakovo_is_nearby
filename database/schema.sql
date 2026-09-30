-- Konakovo Nearby v3.5 Platform Ready
create extension if not exists pgcrypto;

create type public.app_role as enum ('guest','registered','verified','business','admin');
create type public.channel_type as enum ('telegram','max','web');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null default 'guest',
  display_name text,
  phone text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.identity_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel public.channel_type not null,
  external_user_id text not null,
  username text,
  first_name text,
  last_name text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(channel, external_user_id)
);

create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  processed_at timestamptz
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  status text not null default 'draft',
  author_profile_id uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid references public.profiles(id),
  category text not null,
  title text not null,
  description text,
  location_text text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config(key,value) values
('private_beta', '{"enabled":true}'::jsonb),
('platform_version', '{"value":"3.5 Platform Ready"}'::jsonb)
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.identity_links enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.content_items enable row level security;
alter table public.help_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_config enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.identity_links from anon, authenticated;
revoke all on table public.telegram_updates from anon, authenticated;
revoke all on table public.content_items from anon, authenticated;
revoke all on table public.help_requests from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.app_config from anon, authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.identity_links to service_role;
grant select, insert, update, delete on table public.telegram_updates to service_role;
grant select, insert, update, delete on table public.content_items to service_role;
grant select, insert, update, delete on table public.help_requests to service_role;
grant select, insert, update, delete on table public.audit_log to service_role;
grant select, insert, update, delete on table public.app_config to service_role;
