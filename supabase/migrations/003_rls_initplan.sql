-- PRISMBURST auth_rls_initplan. Paste this whole file into the Supabase SQL
-- editor and run it once a reviewer has approved it. Do not apply it from CI.
--
-- The seven policies keep the same names, commands, roles, and owner-only
-- checks. Each uid comparison is a scalar subquery, so Postgres evaluates
-- the id once per statement instead of once per row. Row level security
-- stays enabled. Access is not widened.

begin;

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

commit;
