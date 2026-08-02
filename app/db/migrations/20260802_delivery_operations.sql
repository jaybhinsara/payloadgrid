alter table webhook_events add column if not exists cancelled_at timestamptz;
alter table webhook_events add column if not exists dead_lettered_at timestamptz;
alter table webhook_events drop constraint if exists webhook_events_status_check;
alter table webhook_events add constraint webhook_events_status_check check (status in ('queued','processing','received','delivered','failed','retrying','cancelled','dead_letter'));
create index if not exists webhook_events_dead_letter_idx on webhook_events(received_at desc, id desc) where status = 'dead_letter';
create index if not exists webhook_events_cursor_idx on webhook_events(received_at desc, id desc);