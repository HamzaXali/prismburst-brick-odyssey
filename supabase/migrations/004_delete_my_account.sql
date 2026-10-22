-- PRISMBURST account deletion (Google Play requirement). Paste this whole file
-- into the Supabase SQL editor and run it once a reviewer has approved it.
-- Do not apply it from CI. Safe to run more than once.
--
-- public.delete_my_account() lets a signed-in player delete their own
-- account. It is SECURITY DEFINER because a player cannot delete from
-- auth.users directly. It only ever touches rows whose id equals auth.uid(),
-- the id inside the caller's verified JWT, so one player cannot delete another.
--
--   * search_path is empty; every object is schema-qualified.
--   * EXECUTE is revoked from public and anon and granted only to authenticated.
--   * Row level security is not changed on any table.
--   * No secret key is needed: the game calls it with the publishable key and
--     the player's own session, like upsert_player_save.
--
-- player_saves and profiles also cascade from auth.users, but they are deleted
-- explicitly first so the function stays correct if a cascade is ever removed.
-- auth.identities, auth.sessions, auth.refresh_tokens (via sessions) and
-- auth.mfa_* rows cascade from auth.users.

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.player_saves where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling player''s cloud save, display name and auth user. Only auth.uid(). Granted to authenticated only.';

commit;
