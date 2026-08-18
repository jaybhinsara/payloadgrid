create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text,
  email_verified_at timestamptz,
  verification_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists verification_required boolean not null default false;
alter table users alter column password_hash drop not null;
alter table users add column if not exists suspended_at timestamptz;
alter table users add column if not exists suspension_reason text;
alter table users add column if not exists suspended_by uuid references users(id) on delete set null;

create table if not exists oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'github')),
  provider_user_id text not null,
  email_at_linking text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id),
  unique (user_id, provider)
);

create table if not exists oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('google', 'github')),
  code_verifier text,
  nonce text not null,
  invitation_id uuid,
  return_to text not null default '/dashboard',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table oauth_states add column if not exists invitation_id uuid;
alter table oauth_states drop column if exists invite_token;
alter table oauth_accounts drop constraint if exists oauth_accounts_provider_check;
alter table oauth_accounts add constraint oauth_accounts_provider_check check (provider in ('google', 'github'));
alter table oauth_states drop constraint if exists oauth_states_provider_check;
alter table oauth_states add constraint oauth_states_provider_check check (provider in ('google', 'github'));

create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('verify_email','reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'free' check (plan in ('free', 'starter', 'growth', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organizations add column if not exists suspended_at timestamptz;
alter table organizations add column if not exists suspension_reason text;
alter table organizations add column if not exists suspended_by uuid references users(id) on delete set null;

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  provider text not null check (provider in ('lemon_squeezy', 'paddle', 'razorpay', 'manual')),
  provider_customer_id text,
  provider_subscription_id text unique,
  plan text not null check (plan in ('starter', 'growth', 'enterprise')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_webhook_events (
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, provider_event_id)
);

create index if not exists billing_subscriptions_status_idx on billing_subscriptions(status, current_period_end);

alter table billing_subscriptions drop constraint if exists billing_subscriptions_provider_check;
alter table billing_subscriptions add constraint billing_subscriptions_provider_check
  check (provider in ('lemon_squeezy', 'paddle', 'razorpay', 'manual'));

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'developer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  environment text not null default 'production' check (environment in ('development', 'staging', 'production')),
  payload_retention_mode text not null default 'standard' check (payload_retention_mode in ('standard', 'transient')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table projects add column if not exists environment text not null default 'production';
alter table projects add column if not exists updated_at timestamptz not null default now();
alter table projects add column if not exists payload_retention_mode text not null default 'standard';
alter table projects drop constraint if exists projects_payload_retention_mode_check;
alter table projects add constraint projects_payload_retention_mode_check check (payload_retention_mode in ('standard', 'transient'));

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  uid text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  schema jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table event_types add column if not exists application_id uuid references applications(id) on delete cascade;
alter table event_types drop constraint if exists event_types_project_id_name_key;
create unique index if not exists event_types_scope_name_idx on event_types(project_id, coalesce(application_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table if not exists event_contract_versions (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid not null references event_types(id) on delete cascade,
  version integer not null check (version > 0),
  schema jsonb not null,
  example jsonb,
  compatibility_mode text not null default 'backward' check (compatibility_mode in ('backward','none')),
  compatibility_warnings jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('draft','published','deprecated')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (event_type_id, version)
);

create table if not exists endpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  name text not null,
  provider text not null default 'custom',
  destination_type text not null default 'webhook' check (destination_type in ('webhook')),
  destination_url text not null,
  signing_secret text,
  previous_signing_secret text,
  previous_signing_secret_expires_at timestamptz,
  delivery_headers_encrypted text,
  delivery_header_names text[] not null default '{}'::text[],
  description text,
  rate_limit_per_minute integer not null default 120,
  circuit_breaker_enabled boolean not null default false,
  circuit_breaker_threshold integer not null default 100,
  circuit_state text not null default 'closed' check (circuit_state in ('closed', 'open')),
  circuit_opened_at timestamptz,
  revenue_tracking_mode text not null default 'disabled' check (revenue_tracking_mode in ('disabled', 'automatic', 'custom')),
  revenue_amount_path text,
  revenue_currency_path text,
  revenue_fixed_currency text,
  revenue_amount_unit text not null default 'major' check (revenue_amount_unit in ('major', 'minor')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table endpoints add column if not exists application_id uuid references applications(id) on delete cascade;
alter table endpoints add column if not exists destination_type text not null default 'webhook';
alter table endpoints add column if not exists signing_secret text;
alter table endpoints add column if not exists previous_signing_secret text;
alter table endpoints add column if not exists previous_signing_secret_expires_at timestamptz;
alter table endpoints add column if not exists delivery_headers_encrypted text;
alter table endpoints add column if not exists delivery_header_names text[] not null default '{}'::text[];
alter table endpoints add column if not exists description text;
alter table endpoints add column if not exists rate_limit_per_minute integer not null default 120;
alter table endpoints add column if not exists deleted_at timestamptz;
alter table endpoints add column if not exists circuit_breaker_enabled boolean not null default false;
alter table endpoints add column if not exists circuit_breaker_threshold integer not null default 100;
alter table endpoints add column if not exists circuit_state text not null default 'closed';
alter table endpoints add column if not exists circuit_opened_at timestamptz;
alter table endpoints add column if not exists revenue_tracking_mode text not null default 'disabled';
alter table endpoints add column if not exists revenue_amount_path text;
alter table endpoints add column if not exists revenue_currency_path text;
alter table endpoints add column if not exists revenue_fixed_currency text;
alter table endpoints add column if not exists revenue_amount_unit text not null default 'major';
alter table endpoints drop constraint if exists endpoints_revenue_tracking_mode_check;
alter table endpoints add constraint endpoints_revenue_tracking_mode_check check (revenue_tracking_mode in ('disabled', 'automatic', 'custom'));
alter table endpoints drop constraint if exists endpoints_revenue_amount_unit_check;
alter table endpoints add constraint endpoints_revenue_amount_unit_check check (revenue_amount_unit in ('major', 'minor'));
alter table endpoints drop constraint if exists endpoints_revenue_fixed_currency_check;
alter table endpoints add constraint endpoints_revenue_fixed_currency_check check (revenue_fixed_currency is null or revenue_fixed_currency ~ '^[A-Z]{3}$');
alter table endpoints drop constraint if exists endpoints_circuit_state_check;
alter table endpoints add constraint endpoints_circuit_state_check check (circuit_state in ('closed', 'open'));

create table if not exists endpoint_subscriptions (
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now(),
  primary key (endpoint_id, event_type)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  event_type text not null,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'delivered', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  provider text not null,
  provider_event_id text,
  event_type text not null,
  request_headers jsonb not null default '{}'::jsonb,
  request_body jsonb not null default '{}'::jsonb,
  request_content_type text not null default 'application/json',
  request_raw_body text,
  is_simulation boolean not null default false,
  parent_event_id uuid references webhook_events(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'buffered', 'processing', 'received', 'delivered', 'failed', 'retrying', 'cancelled', 'dead_letter')),
  revenue_amount numeric(18,4) not null default 0,
  revenue_currency text,
  revenue_at_risk numeric(18,4) not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 4,
  next_retry_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table webhook_events add column if not exists application_id uuid references applications(id) on delete cascade;
alter table webhook_events add column if not exists message_id uuid references messages(id) on delete cascade;
alter table webhook_events add column if not exists direction text not null default 'inbound';
alter table webhook_events add column if not exists revenue_amount numeric(18,4) not null default 0;
alter table webhook_events add column if not exists revenue_currency text;
alter table webhook_events alter column revenue_amount type numeric(18,4) using revenue_amount::numeric;
alter table webhook_events alter column revenue_at_risk type numeric(18,4) using revenue_at_risk::numeric;
alter table webhook_events add column if not exists retry_count integer not null default 0;
alter table webhook_events add column if not exists max_retries integer not null default 4;
alter table webhook_events add column if not exists next_retry_at timestamptz;
alter table webhook_events add column if not exists last_error text;
alter table webhook_events add column if not exists locked_at timestamptz;
alter table webhook_events add column if not exists payload_expires_at timestamptz not null default (now() + interval '3 days');
alter table webhook_events add column if not exists payload_redacted_at timestamptz;
alter table webhook_events add column if not exists cancelled_at timestamptz;
alter table webhook_events add column if not exists dead_lettered_at timestamptz;
alter table webhook_events add column if not exists resolved_at timestamptz;
alter table webhook_events add column if not exists resolved_by uuid references users(id) on delete set null;
alter table webhook_events add column if not exists resolution_note text;
alter table webhook_events add column if not exists request_content_type text not null default 'application/json';
alter table webhook_events add column if not exists request_raw_body text;
alter table webhook_events add column if not exists contract_version integer;
alter table webhook_events add column if not exists validation_warnings jsonb not null default '[]'::jsonb;
alter table messages add column if not exists contract_version integer;
alter table messages add column if not exists validation_warnings jsonb not null default '[]'::jsonb;
alter table webhook_events add column if not exists is_simulation boolean not null default false;
alter table webhook_events add column if not exists parent_event_id uuid references webhook_events(id) on delete set null;
alter table webhook_events alter column status set default 'queued';
alter table webhook_events drop constraint if exists webhook_events_status_check;
alter table webhook_events add constraint webhook_events_status_check check (status in ('queued', 'buffered', 'processing', 'received', 'delivered', 'failed', 'retrying', 'cancelled', 'dead_letter'));

create table if not exists delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references webhook_events(id) on delete cascade,
  attempt_number integer not null,
  destination_url text not null,
  request_headers jsonb not null default '{}'::jsonb,
  response_status integer,
  response_headers jsonb not null default '{}'::jsonb,
  response_body text,
  error text,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

alter table delivery_attempts add column if not exists request_headers jsonb not null default '{}'::jsonb;
alter table delivery_attempts add column if not exists response_headers jsonb not null default '{}'::jsonb;

create table if not exists dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references webhook_events(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'publishing', 'published', 'cancelled', 'failed')),
  available_at timestamptz not null default now(),
  publish_attempts integer not null default 0,
  qstash_message_id text,
  last_error text,
  locked_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dispatch_jobs drop constraint if exists dispatch_jobs_status_check;
alter table dispatch_jobs add constraint dispatch_jobs_status_check check (status in ('pending', 'publishing', 'published', 'cancelled', 'failed'));

alter table dispatch_jobs add column if not exists available_at timestamptz not null default now();
alter table dispatch_jobs add column if not exists publish_attempts integer not null default 0;
alter table dispatch_jobs add column if not exists qstash_message_id text;
alter table dispatch_jobs add column if not exists last_error text;
alter table dispatch_jobs add column if not exists locked_at timestamptz;
alter table dispatch_jobs add column if not exists published_at timestamptz;
alter table dispatch_jobs add column if not exists updated_at timestamptz not null default now();

alter table endpoints add column if not exists provider_secret_encrypted text;
alter table endpoints add column if not exists provider_verification_required boolean not null default false;
alter table endpoints add column if not exists provider_secret_hint text;

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['messages:write','events:read']::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table api_keys add column if not exists scopes text[] not null default array['messages:write','events:read']::text[];

create table if not exists api_usage_windows (
  api_key_id uuid not null references api_keys(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (api_key_id, window_start)
);

create table if not exists endpoint_usage_windows (
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (endpoint_id, window_start)
);
create table if not exists transformations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  event_type text,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists circuit_breaker_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  state text not null check (state in ('opened', 'closed')),
  observed_count integer not null default 0,
  baseline_average numeric(12,2) not null default 0,
  baseline_deviation numeric(12,2) not null default 0,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists alert_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  channel text not null default 'email' check (channel in ('email', 'slack', 'webhook')),
  destination text not null,
  failure_threshold integer not null default 3,
  window_minutes integer not null default 15,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'developer' check (role in ('admin', 'developer', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_id_idx on organization_members(user_id);
create unique index if not exists organization_invitations_pending_email_idx on organization_invitations(organization_id, email) where accepted_at is null;
create index if not exists oauth_accounts_user_id_idx on oauth_accounts(user_id);
create index if not exists oauth_states_expires_at_idx on oauth_states(expires_at);
create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists auth_tokens_expiry_idx on auth_tokens(expires_at) where used_at is null;
create index if not exists sessions_expires_at_idx on sessions(expires_at);
create index if not exists projects_organization_id_idx on projects(organization_id);
create index if not exists applications_project_id_idx on applications(project_id);
create index if not exists event_types_project_id_idx on event_types(project_id);
create index if not exists event_contract_versions_event_type_idx on event_contract_versions(event_type_id, version desc);
create index if not exists endpoints_project_id_idx on endpoints(project_id);
create index if not exists endpoints_application_id_idx on endpoints(application_id);
create index if not exists messages_application_created_at_idx on messages(application_id, created_at desc);
create index if not exists webhook_events_endpoint_id_received_at_idx on webhook_events(endpoint_id, received_at desc);
create index if not exists webhook_events_application_id_received_at_idx on webhook_events(application_id, received_at desc);
create index if not exists webhook_events_message_id_idx on webhook_events(message_id);
create index if not exists webhook_events_status_received_at_idx on webhook_events(status, received_at desc);
create index if not exists webhook_events_next_retry_at_idx on webhook_events(next_retry_at) where status = 'retrying';
create index if not exists webhook_events_dead_letter_idx on webhook_events(received_at desc, id desc) where status = 'dead_letter';
create index if not exists webhook_events_cursor_idx on webhook_events(received_at desc, id desc);
create index if not exists webhook_events_event_type_received_idx on webhook_events(event_type, received_at desc);
create index if not exists webhook_events_headers_gin_idx on webhook_events using gin(request_headers jsonb_path_ops);
create index if not exists webhook_events_body_gin_idx on webhook_events using gin(request_body jsonb_path_ops);

create table if not exists replay_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  status text not null default 'running' check (status in ('running','completed','cancelled','failed')),
  filters jsonb not null default '{}'::jsonb,
  rate_limit_per_minute integer not null default 120 check (rate_limit_per_minute between 1 and 10000),
  requested_count integer not null default 0,
  accepted_count integer not null default 0,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists replay_batch_items (
  batch_id uuid not null references replay_batches(id) on delete cascade,
  event_id uuid not null references webhook_events(id) on delete cascade,
  position integer not null,
  primary key (batch_id, event_id)
);

alter table dispatch_jobs add column if not exists replay_batch_id uuid references replay_batches(id) on delete set null;
create index if not exists replay_batches_project_created_idx on replay_batches(project_id, created_at desc);
create index if not exists replay_batch_items_batch_idx on replay_batch_items(batch_id, position);
create index if not exists webhook_events_queue_idx on webhook_events(status, received_at) where status in ('queued', 'processing', 'retrying');
create unique index if not exists webhook_events_provider_dedup_idx on webhook_events(endpoint_id, provider_event_id) where provider_event_id is not null;
create index if not exists webhook_events_payload_expiry_idx on webhook_events(payload_expires_at) where payload_redacted_at is null;
create index if not exists delivery_attempts_event_id_idx on delivery_attempts(event_id);
create index if not exists dispatch_jobs_pending_idx on dispatch_jobs(available_at, created_at) where status = 'pending';
create index if not exists dispatch_jobs_stale_idx on dispatch_jobs(locked_at) where status = 'publishing';
create index if not exists api_keys_project_id_idx on api_keys(project_id);
create index if not exists transformations_project_id_idx on transformations(project_id);
create index if not exists alert_rules_project_id_idx on alert_rules(project_id);
create index if not exists circuit_breaker_events_endpoint_created_at_idx on circuit_breaker_events(endpoint_id, created_at desc);
create index if not exists webhook_events_parent_event_id_idx on webhook_events(parent_event_id);
create index if not exists audit_logs_organization_created_at_idx on audit_logs(organization_id, created_at desc);

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content_markdown text not null default '',
  cover_image_url text,
  cover_image_alt text,
  category text not null default 'Engineering',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  author_id uuid references users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_slug_redirects (
  old_slug text primary key,
  post_id uuid not null references blog_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists platform_audit_logs (
  id bigserial primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_publication_idx on blog_posts(status, published_at desc);
create index if not exists blog_posts_featured_idx on blog_posts(is_featured, published_at desc);
create index if not exists platform_audit_logs_created_at_idx on platform_audit_logs(created_at desc);
create table if not exists alert_notifications (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references alert_rules(id) on delete cascade,
  event_id uuid not null references webhook_events(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  response_status integer,
  error text,
  created_at timestamptz not null default now(),
  unique (rule_id, event_id)
);
create index if not exists alert_notifications_rule_id_idx on alert_notifications(rule_id, created_at desc);
create table if not exists service_checks (
  id bigserial primary key,
  run_id uuid not null,
  service text not null check (service in ('api','dashboard','inbound_webhooks','outbound_delivery','scheduled_retries')),
  status text not null check (status in ('operational','degraded','outage')),
  latency_ms integer not null default 0,
  response_status integer,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  unique (run_id, service)
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('api','dashboard','inbound_webhooks','outbound_delivery','scheduled_retries')),
  status text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  severity text not null check (severity in ('degraded','outage')),
  title text not null,
  summary text not null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  status text not null check (status in ('investigating','identified','monitoring','resolved')),
  message text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists service_checks_service_checked_at_idx on service_checks(service, checked_at desc);
create index if not exists service_checks_run_checked_at_idx on service_checks(run_id, checked_at desc);
create index if not exists incidents_started_at_idx on incidents(started_at desc);
create unique index if not exists incidents_one_open_per_service_idx on incidents(service) where status <> 'resolved';
create index if not exists incident_updates_incident_created_at_idx on incident_updates(incident_id, created_at asc);
