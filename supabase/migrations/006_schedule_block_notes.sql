alter table schedule_blocks
  add column if not exists notes text not null default '';
