-- Add configurable sleep metric values on daily logs
alter table daily_logs
  add column if not exists sleep_metrics jsonb default '{}';
