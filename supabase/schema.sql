-- Dojo schema for Supabase
-- Run this in the Supabase SQL editor

-- Daily logs
create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sleep_hours numeric,
  weight numeric,
  steps integer,
  screen_time_minutes integer,
  focus_minutes integer default 0,
  notes text default '',
  habits jsonb default '{"meditation": false, "skincare": false}',
  custom_metrics jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);

-- Workouts
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid references daily_logs(id) on delete set null,
  date date not null,
  category text not null check (category in ('hiit', 'zone2', 'strength')),
  duration_minutes integer not null,
  notes text default '',
  created_at timestamptz default now()
);

-- Goals
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text not null,
  name text not null,
  target_value numeric not null,
  target_type text not null check (target_type in ('daily', 'weekly')),
  goal_weight_start numeric,
  goal_weight_target numeric,
  unit text default '',
  is_active boolean default true,
  show_in_daily_log boolean default false,
  created_at timestamptz default now()
);

-- Schedule blocks
create table if not exists schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  activity_type text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- Reminders
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null,
  due_time time,
  completed boolean default false,
  rescheduled_from date,
  kind text default 'task' check (kind in ('note', 'task')),
  created_at timestamptz default now()
);

-- Row Level Security
alter table daily_logs enable row level security;
alter table workouts enable row level security;
alter table goals enable row level security;
alter table schedule_blocks enable row level security;
alter table reminders enable row level security;

create policy "Users manage own daily_logs" on daily_logs
  for all using (auth.uid() = user_id);

create policy "Users manage own workouts" on workouts
  for all using (auth.uid() = user_id);

create policy "Users manage own goals" on goals
  for all using (auth.uid() = user_id);

create policy "Users manage own schedule_blocks" on schedule_blocks
  for all using (auth.uid() = user_id);

create policy "Users manage own reminders" on reminders
  for all using (auth.uid() = user_id);

-- Indexes
create index if not exists idx_daily_logs_user_date on daily_logs (user_id, date);
create index if not exists idx_workouts_user_date on workouts (user_id, date);
create index if not exists idx_schedule_blocks_user_date on schedule_blocks (user_id, date);
