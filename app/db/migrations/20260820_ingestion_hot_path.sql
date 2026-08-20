-- Apply before deploying the ingestion hot-path release.
begin;
lock table messages, webhook_events in share row exclusive mode;
alter table messages add column if not exists is_simulation boolean not null default false;
create table if not exists organization_usage_month_buckets (
  organization_id uuid not null references organizations(id) on delete cascade,
  month_start date not null,
  bucket smallint not null check (bucket between 0 and 15),
  outbound_events bigint not null default 0 check (outbound_events >= 0),
  inbound_events bigint not null default 0 check (inbound_events >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, month_start, bucket)
);

create or replace function update_outbound_usage_bucket() returns trigger language plpgsql as $$
declare
  target_organization uuid;
  target_month date;
  target_bucket smallint;
begin
  if new.is_simulation then return new; end if;
  select organization_id into target_organization from projects where id = new.project_id;
  if target_organization is null then return new; end if;
  target_month := date_trunc('month', new.created_at at time zone 'UTC')::date;
  target_bucket := (hashtextextended(new.id::text, 0) & 15::bigint)::smallint;
  insert into organization_usage_month_buckets (organization_id, month_start, bucket, outbound_events)
  values (target_organization, target_month, target_bucket, 1)
  on conflict (organization_id, month_start, bucket) do update
    set outbound_events = organization_usage_month_buckets.outbound_events + 1, updated_at = now();
  return new;
end $$;

create or replace function update_inbound_usage_bucket() returns trigger language plpgsql as $$
declare
  target_organization uuid;
  target_month date;
  target_bucket smallint;
begin
  if new.direction <> 'inbound' or new.is_simulation then return new; end if;
  select p.organization_id into target_organization
  from endpoints ep join projects p on p.id = ep.project_id where ep.id = new.endpoint_id;
  if target_organization is null then return new; end if;
  target_month := date_trunc('month', new.received_at at time zone 'UTC')::date;
  target_bucket := (hashtextextended(new.id::text, 0) & 15::bigint)::smallint;
  insert into organization_usage_month_buckets (organization_id, month_start, bucket, inbound_events)
  values (target_organization, target_month, target_bucket, 1)
  on conflict (organization_id, month_start, bucket) do update
    set inbound_events = organization_usage_month_buckets.inbound_events + 1, updated_at = now();
  return new;
end $$;

drop trigger if exists messages_usage_bucket_trigger on messages;
create trigger messages_usage_bucket_trigger after insert on messages
for each row execute function update_outbound_usage_bucket();

drop trigger if exists webhook_events_usage_bucket_trigger on webhook_events;
create trigger webhook_events_usage_bucket_trigger after insert on webhook_events
for each row execute function update_inbound_usage_bucket();

with usage_rows as (
  select p.organization_id, date_trunc('month', m.created_at at time zone 'UTC')::date as month_start,
    (hashtextextended(m.id::text, 0) & 15::bigint)::smallint as bucket,
    count(*)::bigint as outbound_events, 0::bigint as inbound_events
  from messages m join projects p on p.id = m.project_id
  where p.organization_id is not null and m.is_simulation = false
    and not exists (select 1 from webhook_events simulation where simulation.message_id = m.id and simulation.is_simulation = true)
  group by p.organization_id, month_start, bucket
  union all
  select p.organization_id, date_trunc('month', e.received_at at time zone 'UTC')::date as month_start,
    (hashtextextended(e.id::text, 0) & 15::bigint)::smallint as bucket,
    0::bigint as outbound_events, count(*)::bigint as inbound_events
  from webhook_events e join endpoints ep on ep.id = e.endpoint_id join projects p on p.id = ep.project_id
  where p.organization_id is not null and e.direction = 'inbound' and e.is_simulation = false
  group by p.organization_id, month_start, bucket
), totals as (
  select organization_id, month_start, bucket, sum(outbound_events)::bigint as outbound_events,
    sum(inbound_events)::bigint as inbound_events
  from usage_rows group by organization_id, month_start, bucket
)
insert into organization_usage_month_buckets (organization_id, month_start, bucket, outbound_events, inbound_events)
select organization_id, month_start, bucket, outbound_events, inbound_events from totals
on conflict (organization_id, month_start, bucket) do update
set outbound_events = excluded.outbound_events, inbound_events = excluded.inbound_events, updated_at = now();
commit;
