-- PRISMBURST cloud save. Paste this whole file into the Supabase SQL editor and run it.
-- Safe to run more than once.
--
-- The browser may only use the publishable (anon) key. Do not put the dashboard
-- secret key in the game or in this repo. Row Level Security lets a signed-in
-- player read and write only their own row. The anon role has no policies and
-- no grants, so it cannot touch the table.
--
-- Conflict rule: the game merges progress monotonically and sends the result
-- through upsert_player_save. That function writes only when p_expected_revision
-- matches the stored revision (0 means "no row yet"). A mismatch raises
-- revision_conflict (SQLSTATE 40001). The client re-fetches, merges, and retries.
-- A BEFORE UPDATE trigger also rejects a write that does not move revision
-- forward by exactly 1, so a stale update cannot keep an old revision.

create table if not exists public.player_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  save_version integer not null default 1,
  revision bigint not null default 1,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_saves add column if not exists data jsonb;
alter table public.player_saves add column if not exists save_version integer not null default 1;
alter table public.player_saves add column if not exists revision bigint not null default 1;
alter table public.player_saves add column if not exists client_updated_at timestamptz not null default now();
alter table public.player_saves add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_saves_data_is_object') then
    alter table public.player_saves
      add constraint player_saves_data_is_object check (jsonb_typeof(data) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_saves_data_size') then
    alter table public.player_saves
      add constraint player_saves_data_size check (octet_length(data::text) < 65536);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_saves_save_version_positive') then
    alter table public.player_saves
      add constraint player_saves_save_version_positive check (save_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_saves_revision_positive') then
    alter table public.player_saves
      add constraint player_saves_revision_positive check (revision >= 1);
  end if;
end $$;

alter table public.player_saves enable row level security;

revoke all on table public.player_saves from public, anon;
grant select, insert, update, delete on table public.player_saves to authenticated;

drop policy if exists player_saves_select_own on public.player_saves;
create policy player_saves_select_own
  on public.player_saves
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists player_saves_insert_own on public.player_saves;
create policy player_saves_insert_own
  on public.player_saves
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists player_saves_update_own on public.player_saves;
create policy player_saves_update_own
  on public.player_saves
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists player_saves_delete_own on public.player_saves;
create policy player_saves_delete_own
  on public.player_saves
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.player_saves_require_revision_bump()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '42501';
  end if;
  if new.revision is distinct from old.revision + 1 then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.player_saves_require_revision_bump() from public, anon;
grant execute on function public.player_saves_require_revision_bump() to authenticated;

drop trigger if exists player_saves_revision_bump on public.player_saves;
create trigger player_saves_revision_bump
  before update on public.player_saves
  for each row
  execute function public.player_saves_require_revision_bump();

create or replace function public.upsert_player_save(
  p_data jsonb,
  p_save_version integer,
  p_client_updated_at timestamptz,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_row public.player_saves;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid data' using errcode = '22023';
  end if;
  if octet_length(p_data::text) >= 65536 then
    raise exception 'save too large' using errcode = '22023';
  end if;
  if p_save_version is null or p_save_version < 1 then
    raise exception 'invalid save_version' using errcode = '22023';
  end if;
  if p_client_updated_at is null then
    raise exception 'invalid client_updated_at' using errcode = '22023';
  end if;

  select revision into v_rev
  from public.player_saves
  where user_id = v_uid
  for update;

  if not found then
    if p_expected_revision is distinct from 0 then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
    insert into public.player_saves (user_id, data, save_version, revision, client_updated_at, updated_at)
    values (v_uid, p_data, p_save_version, 1, p_client_updated_at, pg_catalog.now())
    returning * into v_row;
  else
    if v_rev is distinct from p_expected_revision then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
    update public.player_saves
      set data = p_data,
          save_version = p_save_version,
          revision = v_rev + 1,
          client_updated_at = p_client_updated_at
      where user_id = v_uid
        and revision = p_expected_revision
      returning * into v_row;
    if v_row.user_id is null then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'data', v_row.data,
    'save_version', v_row.save_version,
    'revision', v_row.revision,
    'client_updated_at', v_row.client_updated_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.upsert_player_save(jsonb, integer, timestamptz, bigint) from public, anon;
grant execute on function public.upsert_player_save(jsonb, integer, timestamptz, bigint) to authenticated;

comment on table public.player_saves is
  'One save per signed-in player. data is the game save plus save_version and client_updated_at. Max 64 KB.';

-- Display names. Table, grants, and trigger match supabase/migrations/002_profiles.sql.
-- Policies match supabase/migrations/003_rls_initplan.sql: (select auth.uid()).
-- Does not read or write player_saves. Safe to run more than once.

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
  using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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
