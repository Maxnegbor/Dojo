-- Dojo schema for Supabase
-- Run this in the Supabase SQL editor (fresh project), or run migrations/001 for existing projects.

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
  habits jsonb default '{}',
  custom_metrics jsonb default '{}',
  sleep_metrics jsonb default '{}',
  morning_log jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);

-- Workouts (category is a free-text workout type id)
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid references daily_logs(id) on delete set null,
  date date not null,
  category text not null,
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
  target_value numeric,
  target_type text check (target_type in ('daily', 'weekly')),
  log_period text,
  target_period text,
  period_days integer,
  period_start_date date,
  period_end_date date,
  period_recurring boolean,
  category_id text,
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

-- User preferences & config (mirrors former localStorage keys)
create table if not exists user_storage (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- Row Level Security
alter table daily_logs enable row level security;
alter table workouts enable row level security;
alter table goals enable row level security;
alter table schedule_blocks enable row level security;
alter table reminders enable row level security;
alter table user_storage enable row level security;

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

create policy "Users manage own user_storage" on user_storage
  for all using (auth.uid() = user_id);

-- Account deletion (run delete_own_account as authenticated user)
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- Indexes
create index if not exists idx_daily_logs_user_date on daily_logs (user_id, date);
create index if not exists idx_workouts_user_date on workouts (user_id, date);
create index if not exists idx_schedule_blocks_user_date on schedule_blocks (user_id, date);
create index if not exists idx_user_storage_user_id on user_storage (user_id);
