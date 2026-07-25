-- ═══════════════════════════════════════════════════════════════════════════
-- Row-Level Security regression test
--
-- Proves the central privacy promise of Family Hub: one family can never see
-- or touch another family's rows. Run this after any change to schema.sql.
--
-- It needs a THROWAWAY Postgres 16 database — it inserts fake users and never
-- cleans up. Never point it at the real Supabase project.
--
--   initdb -D /tmp/pgtest -U postgres --auth=trust
--   pg_ctl -D /tmp/pgtest -o '-p 55432 -k /tmp' start
--   psql -h /tmp -p 55432 -U postgres -f supabase/tests/rls-test.sql
--
-- Expected result: every test line prints PASS. Any FAIL is a security bug.
-- ═══════════════════════════════════════════════════════════════════════════

\pset pager off
\set ON_ERROR_STOP on

-- ── Stand-ins for the parts Supabase normally provides ────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

create schema if not exists auth;
create extension if not exists "pgcrypto";
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Supabase grants the auth schema to both roles; without this, policies and
-- queries that call auth.uid() fail with "permission denied for schema auth".
grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated, anon;

\echo '── loading schema.sql ─────────────────────────────────────────────────'
\set QUIET on
\o /dev/null
\i supabase/schema.sql
\o
\set QUIET off

-- Supabase grants these automatically; replicate that here.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

-- ── Tiny assertion helper ─────────────────────────────────────────────────
-- Every assertion below compares row counts, so bigint covers all of them.
create or replace function pg_temp.check(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual = expected then
    raise notice 'PASS  %', label;
  else
    raise warning 'FAIL  % — expected %, got %', label, expected, actual;
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

-- ── Alice sets up her household ───────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select public.create_family('Alice Family', 'Alice') as alice_family \gset
insert into public.memos (family_id, body) values (:'alice_family', 'Alice memo');
insert into public.grocery_items (family_id, name) values (:'alice_family', 'Alice milk');
insert into public.events (family_id, title, starts_at, ends_at)
  values (:'alice_family', 'Alice event', now(), now() + interval '1 hour');
insert into public.anniversaries (family_id, title, date)
  values (:'alice_family', 'Alice anniversary', '1990-05-05');

-- ── Bob sets up a completely separate household ───────────────────────────
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select public.create_family('Bob Family', 'Bob') as bob_family \gset
insert into public.memos (family_id, body) values (:'bob_family', 'Bob memo');

\echo ''
\echo '── isolation: Bob must not see anything belonging to Alice ────────────'
select pg_temp.check('memos hidden across families',
  (select count(*) from public.memos), 1);
select pg_temp.check('families hidden across families',
  (select count(*) from public.families), 1);
select pg_temp.check('grocery items hidden across families',
  (select count(*) from public.grocery_items), 0);
select pg_temp.check('events hidden across families',
  (select count(*) from public.events), 0);
select pg_temp.check('anniversaries hidden across families',
  (select count(*) from public.anniversaries), 0);
select pg_temp.check('invite code of another family not readable',
  (select count(*) from public.families where name = 'Alice Family'), 0);
select pg_temp.check('members of another family not readable',
  (select count(*) from public.members where name = 'Alice'), 0);

\echo ''
\echo '── writes: Bob must not be able to modify Alice data ──────────────────'
do $$
begin
  insert into public.memos (family_id, body)
  values ((select id from public.families where name = 'Alice Family' limit 1),
          'injected');
  raise warning 'FAIL  cross-family INSERT was allowed';
exception
  -- Either RLS rejects it, or the family_id subquery is itself invisible and
  -- returns null, tripping the NOT NULL constraint. Both are safe outcomes.
  when insufficient_privilege or not_null_violation then
    raise notice 'PASS  cross-family INSERT blocked';
end;
$$;

with u as (update public.memos set done = true where body = 'Alice memo' returning 1)
select pg_temp.check('cross-family UPDATE affects nothing', (select count(*) from u), 0);

with d as (delete from public.memos where body = 'Alice memo' returning 1)
select pg_temp.check('cross-family DELETE affects nothing', (select count(*) from d), 0);

with u as (update public.members set name = 'Hacked' where name = 'Alice' returning 1)
select pg_temp.check('cannot rename a member of another family', (select count(*) from u), 0);

\echo ''
\echo '── invite flow ────────────────────────────────────────────────────────'
do $$
begin
  perform public.join_family('BOGUS999', 'Bob');
  raise warning 'FAIL  bogus invite code was accepted';
exception when others then
  raise notice 'PASS  bogus invite code rejected';
end;
$$;

reset role;
select invite_code from public.families where name = 'Alice Family' \gset
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select public.join_family(:'invite_code', 'Bob') as joined \gset
select pg_temp.check('after joining, memos of both families visible',
  (select count(*) from public.memos), 2);

-- Joining twice must not create a duplicate membership.
select public.join_family(:'invite_code', 'Bob') as rejoined \gset
select pg_temp.check('re-joining does not duplicate membership',
  (select count(*) from public.members where auth_user_id = auth.uid()), 2);

\echo ''
\echo '── signed-out users ───────────────────────────────────────────────────'
reset role; set role anon;
set request.jwt.claim.sub = '';
do $$
declare n int;
begin
  select count(*) into n from public.memos;
  if n = 0 then
    raise notice 'PASS  anonymous reads return nothing';
  else
    raise warning 'FAIL  anonymous read returned % rows', n;
  end if;
exception when insufficient_privilege then
  raise notice 'PASS  anonymous reads denied outright';
end;
$$;

reset role;
\echo ''
\echo '── done. Any FAIL / WARNING above is a security bug. ──────────────────'
