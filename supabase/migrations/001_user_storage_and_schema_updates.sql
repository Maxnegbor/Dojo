-- Run after schema.sql (or merge into a fresh project)

-- daily_logs: morning log
alter table daily_logs add column if not exists morning_log jsonb;

-- goals: extended fields + nullable target
alter table goals alter column target_value drop not null;
alter table goals add column if not exists log_period text;
alter table goals add column if not exists target_period text;
alter table goals add column if not exists period_days integer;
alter table goals add column if not exists period_start_date date;
alter table goals add column if not exists period_end_date date;
alter table goals add column if not exists period_recurring boolean;
alter table goals add column if not exists category_id text;

-- workouts: allow dynamic categories
alter table workouts drop constraint if exists workouts_category_check;

-- user-scoped key-value storage (settings, habit types, weekly logs, drafts, etc.)
create table if not exists user_storage (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table user_storage enable row level security;

create policy "Users manage own user_storage" on user_storage
  for all using (auth.uid() = user_id);

create index if not exists idx_user_storage_user_id on user_storage (user_id);
