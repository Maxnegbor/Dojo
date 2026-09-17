-- Shared household data (habit contracts). Any signed-in user can read/write —
-- this app is used by two people who share one Dojo.

create table if not exists shared_app_data (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table shared_app_data enable row level security;

drop policy if exists "Authenticated users manage shared app data" on shared_app_data;
create policy "Authenticated users manage shared app data"
  on shared_app_data
  for all
  to authenticated
  using (true)
  with check (true);

alter table shared_app_data replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table shared_app_data';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
