-- PRISMBURST display names. Paste this whole file into the Supabase SQL editor
-- and run it. Safe to run more than once. It does not read or write player_saves.
--
-- A signed-in player can read and insert their own row, and can update only
-- display_name. There is no delete policy. anon and public receive no grants.
-- The trigger is SECURITY INVOKER with a locked search_path.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_ok') then
    alter table public.profiles
      add constraint profiles_display_name_ok check (
        char_length(display_name) between 3 and 20
        and display_name = btrim(display_name)
        and display_name !~ '[[:cntrl:]]'
        and strpos(display_name, '<') = 0
        and strpos(display_name, '>') = 0
      );
  end if;
end $$;

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon;
grant select, insert on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = pg_catalog.now();
    new.updated_at = pg_catalog.now();
  elsif tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'id is immutable' using errcode = '42501';
    end if;
    new.created_at = old.created_at;
    new.updated_at = pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_guard() from public, anon;
grant execute on function public.profiles_guard() to authenticated;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard();

comment on table public.profiles is
  'One display name per signed-in player. 3–20 characters, no control characters, no < or >. Not the email address.';
