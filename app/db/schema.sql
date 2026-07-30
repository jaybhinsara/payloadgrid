create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists endpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  provider text not null default 'custom',
  destination_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  request_headers jsonb not null default '{}'::jsonb,
  request_body jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'delivered', 'failed', 'retrying')),
  revenue_at_risk integer not null default 0,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references webhook_events(id) on delete cascade,
  attempt_number integer not null,
  destination_url text not null,
  response_status integer,
  response_body text,
  error text,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists endpoints_project_id_idx on endpoints(project_id);
create index if not exists webhook_events_endpoint_id_received_at_idx on webhook_events(endpoint_id, received_at desc);
create index if not exists webhook_events_status_received_at_idx on webhook_events(status, received_at desc);
create index if not exists delivery_attempts_event_id_idx on delivery_attempts(event_id);
alter table webhook_events add column if not exists retry_count integer not null default 0;
alter table webhook_events add column if not exists max_retries integer not null default 4;
alter table webhook_events add column if not exists next_retry_at timestamptz;
alter table webhook_events add column if not exists last_error text;

create index if not exists webhook_events_next_retry_at_idx on webhook_events(next_retry_at) where status = 'retrying';
