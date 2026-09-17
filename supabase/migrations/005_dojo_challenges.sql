-- Secret Dojo challenges. Anyone with the link can read and join by name.
-- Host create/edit/delete requires a key checked against a private hash.

create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;

create table if not exists private.dojo_host_secret (
  key_sha256 text primary key
);

insert into private.dojo_host_secret (key_sha256)
values ('322ac9c5f39fcb8a5cf2d3ad558913ad6b056d8093c50704dda0215ee11c2a3a')
on conflict do nothing;

revoke all on schema private from public;
revoke all on table private.dojo_host_secret from public;

alter table private.dojo_host_secret enable row level security;

create or replace function private.dojo_host_key_matches(p_key text)
returns boolean
language sql
stable
set search_path = private, extensions
as $$
  select encode(extensions.digest(convert_to(coalesce(p_key, ''), 'UTF8'), 'sha256'), 'hex')
    = (select key_sha256 from private.dojo_host_secret limit 1);
$$;

revoke all on function private.dojo_host_key_matches(text) from public;

create table if not exists public.dojo_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dojo_challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.dojo_challenges(id) on delete cascade,
  name text not null,
  joined_at timestamptz not null default now(),
  constraint dojo_challenge_members_name_len check (length(trim(name)) between 1 and 40)
);

create unique index if not exists dojo_challenge_members_unique_name
  on public.dojo_challenge_members (challenge_id, lower(trim(name)));

create index if not exists dojo_challenge_members_challenge_id
  on public.dojo_challenge_members (challenge_id);

create or replace function public.dojo_challenge_members_trim_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := trim(new.name);
  return new;
end;
$$;

drop trigger if exists dojo_challenge_members_trim_name on public.dojo_challenge_members;
create trigger dojo_challenge_members_trim_name
before insert or update on public.dojo_challenge_members
for each row execute function public.dojo_challenge_members_trim_name();

alter table public.dojo_challenges enable row level security;
alter table public.dojo_challenge_members enable row level security;

drop policy if exists "Anyone can read dojo challenges" on public.dojo_challenges;
create policy "Anyone can read dojo challenges"
  on public.dojo_challenges
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read dojo challenge members" on public.dojo_challenge_members;
create policy "Anyone can read dojo challenge members"
  on public.dojo_challenge_members
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can join an open dojo challenge" on public.dojo_challenge_members;
create policy "Anyone can join an open dojo challenge"
  on public.dojo_challenge_members
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.dojo_challenges c
      where c.id = challenge_id and c.status = 'open'
    )
  );

grant select on table public.dojo_challenges to anon, authenticated;
grant select, insert on table public.dojo_challenge_members to anon, authenticated;

create or replace function public.dojo_verify_admin_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.dojo_host_key_matches(p_key);
$$;

create or replace function public.dojo_admin_upsert_challenge(
  p_key text,
  p_id uuid default null,
  p_title text default '',
  p_description text default '',
  p_status text default 'open',
  p_starts_on date default null,
  p_ends_on date default null
)
returns public.dojo_challenges
language plpgsql
security definer
set search_path = public, private
as $$
declare
  rec public.dojo_challenges;
  v_title text := trim(coalesce(p_title, ''));
  v_status text := coalesce(nullif(trim(coalesce(p_status, '')), ''), 'open');
begin
  if not private.dojo_host_key_matches(p_key) then
    raise exception 'Invalid host key' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'Title is required';
  end if;
  if v_status not in ('open', 'closed') then
    raise exception 'Invalid status';
  end if;

  if p_id is null then
    insert into public.dojo_challenges (title, description, status, starts_on, ends_on)
    values (v_title, coalesce(p_description, ''), v_status, p_starts_on, p_ends_on)
    returning * into rec;
  else
    update public.dojo_challenges
    set
      title = v_title,
      description = coalesce(p_description, ''),
      status = v_status,
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      updated_at = now()
    where id = p_id
    returning * into rec;
    if rec.id is null then
      raise exception 'Challenge not found';
    end if;
  end if;

  return rec;
end;
$$;

create or replace function public.dojo_admin_delete_challenge(p_key text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.dojo_host_key_matches(p_key) then
    raise exception 'Invalid host key' using errcode = '42501';
  end if;
  delete from public.dojo_challenges where id = p_id;
end;
$$;

create or replace function public.dojo_admin_remove_member(p_key text, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.dojo_host_key_matches(p_key) then
    raise exception 'Invalid host key' using errcode = '42501';
  end if;
  delete from public.dojo_challenge_members where id = p_member_id;
end;
$$;

revoke all on function public.dojo_verify_admin_key(text) from public;
revoke all on function public.dojo_admin_upsert_challenge(text, uuid, text, text, text, date, date) from public;
revoke all on function public.dojo_admin_delete_challenge(text, uuid) from public;
revoke all on function public.dojo_admin_remove_member(text, uuid) from public;

grant execute on function public.dojo_verify_admin_key(text) to anon, authenticated;
grant execute on function public.dojo_admin_upsert_challenge(text, uuid, text, text, text, date, date) to anon, authenticated;
grant execute on function public.dojo_admin_delete_challenge(text, uuid) to anon, authenticated;
grant execute on function public.dojo_admin_remove_member(text, uuid) to anon, authenticated;

alter table public.dojo_challenges replica identity full;
alter table public.dojo_challenge_members replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table public.dojo_challenges';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.dojo_challenge_members';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
