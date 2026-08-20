begin;

create table if not exists api_usage_window_buckets (
  api_key_id uuid not null references api_keys(id) on delete cascade,
  window_start timestamptz not null,
  bucket smallint not null check (bucket between 0 and 15),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (api_key_id, window_start, bucket)
);

create table if not exists endpoint_usage_window_buckets (
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  window_start timestamptz not null,
  bucket smallint not null check (bucket between 0 and 15),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (endpoint_id, window_start, bucket)
);

create index if not exists api_usage_window_buckets_window_idx on api_usage_window_buckets(window_start);
create index if not exists endpoint_usage_window_buckets_window_idx on endpoint_usage_window_buckets(window_start);

insert into api_usage_window_buckets (api_key_id, window_start, bucket, request_count)
select api_key_id, window_start, 0, request_count
from api_usage_windows
where window_start >= date_trunc('minute', now()) - interval '30 minutes'
on conflict (api_key_id, window_start, bucket)
do update set request_count = greatest(api_usage_window_buckets.request_count, excluded.request_count);

insert into endpoint_usage_window_buckets (endpoint_id, window_start, bucket, request_count)
select endpoint_id, window_start, 0, request_count
from endpoint_usage_windows
where window_start >= date_trunc('minute', now()) - interval '30 minutes'
on conflict (endpoint_id, window_start, bucket)
do update set request_count = greatest(endpoint_usage_window_buckets.request_count, excluded.request_count);

commit;
