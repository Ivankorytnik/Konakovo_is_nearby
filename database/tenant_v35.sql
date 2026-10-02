-- Konakovo Nearby v3.5 Platform Ready
-- Tenant / multi-city foundation for pilot Konakovo.

create table if not exists public.tenants(
  id uuid primary key,
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants(id,slug,name,status)
values ('11111111-1111-4111-8111-111111111111','konakovo','Конаково','active')
on conflict (id) do nothing;

-- Domain entities carry tenant_id. Production currently uses Konakovo as default tenant.
-- Tables: profiles, identity_links, content_items, help_requests, businesses,
-- bot_states, referrals, telegram_updates, audit_log.

-- IdentityLink uniqueness is tenant-scoped:
-- unique (tenant_id, channel, external_user_id)

-- Direct anon/authenticated table access stays revoked.
-- Edge Functions use service_role and MUST explicitly filter TENANT_ID.

-- Production Edge Functions currently use:
-- TENANT_ID = 11111111-1111-4111-8111-111111111111

-- Required indexes:
create index if not exists idx_profiles_tenant on public.profiles(tenant_id);
create index if not exists idx_content_items_tenant_status on public.content_items(tenant_id,status,published_at desc);
create index if not exists idx_help_requests_tenant_status on public.help_requests(tenant_id,status,created_at desc);
create index if not exists idx_businesses_tenant_status on public.businesses(tenant_id,status,verified);
create index if not exists idx_referrals_tenant on public.referrals(tenant_id,inviter_profile_id,created_at desc);
create index if not exists idx_audit_tenant on public.audit_log(tenant_id,created_at desc);
create index if not exists idx_updates_tenant on public.telegram_updates(tenant_id,received_at desc);
