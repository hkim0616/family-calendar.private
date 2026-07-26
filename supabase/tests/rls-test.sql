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

-- Back to the owner: these inspect catalogs, not family data.
reset role;

\echo ''
\echo '── realtime plumbing (needed for live updates between phones) ─────────'
select pg_temp.check('memos published to realtime',
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'memos'), 1);
select pg_temp.check('grocery_items published to realtime',
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'grocery_items'), 1);
select pg_temp.check('events published to realtime',
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'events'), 1);

-- Without REPLICA IDENTITY FULL ('f'), a DELETE only reports the primary key,
-- so subscribers filtering on family_id never receive it and deletions stop
-- propagating between devices.
select pg_temp.check('memos replica identity is FULL',
  (select count(*) from pg_class
   where oid = 'public.memos'::regclass and relreplident = 'f'), 1);
select pg_temp.check('grocery_items replica identity is FULL',
  (select count(*) from pg_class
   where oid = 'public.grocery_items'::regclass and relreplident = 'f'), 1);
select pg_temp.check('events replica identity is FULL',
  (select count(*) from pg_class
   where oid = 'public.events'::regclass and relreplident = 'f'), 1);

\echo ''
\echo '── calendar subscription feed ─────────────────────────────────────────'
-- Each family gets its own unguessable token.
select pg_temp.check('every family has a distinct calendar token',
  (select count(distinct calendar_token) from public.families), 2);

select calendar_token from public.families where name = 'Alice Family' \gset alice_
select calendar_token from public.families where name = 'Bob Family'   \gset bob_

-- The feed is reachable by `anon`, since a subscribing calendar cannot log in.
set role anon;
set request.jwt.claim.sub = '';

select pg_temp.check('feed returns only the token owner''s events',
  (select count(*) from public.calendar_feed(:'alice_calendar_token')
   where event_id is not null), 1);
select pg_temp.check('feed names the right family',
  (select count(*) from public.calendar_feed(:'alice_calendar_token')
   where family_name = 'Alice Family'), 1);
select pg_temp.check('Bob''s token never exposes Alice''s events',
  (select count(*) from public.calendar_feed(:'bob_calendar_token')
   where title = 'Alice event'), 0);
select pg_temp.check('an unknown token returns nothing at all',
  (select count(*) from public.calendar_feed(
     '00000000-0000-0000-0000-000000000000'::uuid)), 0);

-- The feed is the ONLY thing anon may reach; the tables stay shut.
do $$
declare n int;
begin
  select count(*) into n from public.events;
  if n = 0 then
    raise notice 'PASS  anon still cannot read the events table directly';
  else
    raise warning 'FAIL  anon read % event rows directly', n;
  end if;
exception when insufficient_privilege then
  raise notice 'PASS  anon still cannot read the events table directly';
end;
$$;

-- A signed-out visitor must not be able to rotate anyone's token.
do $$
begin
  perform public.reset_calendar_token();
  raise warning 'FAIL  anon was allowed to reset a calendar token';
exception when others then
  raise notice 'PASS  anon cannot reset a calendar token';
end;
$$;

-- Rotating invalidates the old link.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.reset_calendar_token() as rotated \gset
reset role; set role anon;
set request.jwt.claim.sub = '';
select pg_temp.check('the old calendar link stops working after a reset',
  (select count(*) from public.calendar_feed(:'alice_calendar_token')), 0);
select pg_temp.check('the new calendar link works',
  (select count(*) from public.calendar_feed(:'rotated')
   where family_name = 'Alice Family'), 1);

\echo ''
\echo '── push notifications ─────────────────────────────────────────────────'
reset role;
-- The scheduler secret normally comes from SETUP.md; use a fixed one here.
insert into public.app_config (key, value)
values ('push_cron_secret', 'test-secret-abc')
on conflict (key) do update set value = excluded.value;

select id from public.families where name = 'Alice Family' \gset alice_
select id from public.members  where name = 'Alice'        \gset alicemember_
select id from public.members  where name = 'Bob' and family_id = :'bob_family' \gset bobmember_

-- Alice and Bob each register a device.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.push_subscriptions (family_id, member_id, endpoint, p256dh, auth)
values (:'alice_id', :'alicemember_id', 'https://push.example/alice', 'k1', 'a1');

select pg_temp.check('a member can register their own device',
  (select count(*) from public.push_subscriptions), 1);

-- Bob must not be able to see or touch Alice's device endpoint: whoever holds an
-- endpoint can push to that phone.
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('one member cannot see another member''s device',
  (select count(*) from public.push_subscriptions
   where endpoint = 'https://push.example/alice'), 0);

with d as (delete from public.push_subscriptions
           where endpoint = 'https://push.example/alice' returning 1)
select pg_temp.check('one member cannot delete another member''s device',
  (select count(*) from d), 0);

-- Registering a device against someone else's member row must fail.
do $$
begin
  insert into public.push_subscriptions (family_id, member_id, endpoint, p256dh, auth)
  values (
    (select id from public.families where name = 'Alice Family' limit 1),
    (select id from public.members where name = 'Alice' limit 1),
    'https://push.example/forged', 'k', 'a');
  raise warning 'FAIL  a member could register a device for someone else';
exception when insufficient_privilege or not_null_violation then
  raise notice 'PASS  cannot register a device for another member';
end;
$$;

-- The bookkeeping tables must be invisible to clients.
do $$
declare n int;
begin
  select count(*) into n from public.app_config;
  if n = 0 then
    raise notice 'PASS  app_config is not readable by clients';
  else
    raise warning 'FAIL  app_config leaked % rows to a client', n;
  end if;
exception when insufficient_privilege then
  raise notice 'PASS  app_config is not readable by clients';
end;
$$;

do $$
declare n int;
begin
  select count(*) into n from public.push_sends;
  if n = 0 then
    raise notice 'PASS  push_sends is not readable by clients';
  else
    raise warning 'FAIL  push_sends leaked % rows to a client', n;
  end if;
exception when insufficient_privilege then
  raise notice 'PASS  push_sends is not readable by clients';
end;
$$;

-- ── the scheduler functions are gated on the shared secret ────────────────
reset role; set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  perform public.push_due('wrong-secret');
  raise warning 'FAIL  push_due accepted a wrong secret';
exception when others then
  raise notice 'PASS  push_due rejects a wrong secret';
end;
$$;

do $$
begin
  perform public.push_due(null);
  raise warning 'FAIL  push_due accepted a null secret';
exception when others then
  raise notice 'PASS  push_due rejects a null secret';
end;
$$;

do $$
begin
  perform public.push_claim('wrong-secret',
    '00000000-0000-0000-0000-000000000000'::uuid, 'k');
  raise warning 'FAIL  push_claim accepted a wrong secret';
exception when others then
  raise notice 'PASS  push_claim rejects a wrong secret';
end;
$$;

do $$
begin
  perform public.push_forget('wrong-secret', 'https://push.example/alice');
  raise warning 'FAIL  push_forget accepted a wrong secret';
exception when others then
  raise notice 'PASS  push_forget rejects a wrong secret';
end;
$$;

-- With the right secret the scheduler gets exactly what it needs.
select pg_temp.check('push_due returns families that have devices',
  (select jsonb_array_length(public.push_due('test-secret-abc'))), 1);

select pg_temp.check('push_due includes the device to push to',
  (select jsonb_array_length(public.push_due('test-secret-abc') -> 0 -> 'subscriptions')), 1);

select pg_temp.check('push_due counts the shopping list',
  (select (public.push_due('test-secret-abc') -> 0 ->> 'grocery_to_buy')::int), 1);

select pg_temp.check('push_due includes anniversaries',
  (select jsonb_array_length(public.push_due('test-secret-abc') -> 0 -> 'anniversaries')), 1);

-- Claiming is what makes a notification send once and only once.
select pg_temp.check('the first claim of a key succeeds',
  (select case when public.push_claim('test-secret-abc', :'alice_id', 'dedupe-1')
               then 1 else 0 end), 1);
select pg_temp.check('the same key cannot be claimed twice',
  (select case when public.push_claim('test-secret-abc', :'alice_id', 'dedupe-1')
               then 1 else 0 end), 0);
-- Two statements, not one expression: push_release returns void, and relying on
-- evaluation order inside a single AND is how you write a test that lies.
select public.push_release('test-secret-abc', 'dedupe-1');
select pg_temp.check('releasing a claim allows a retry',
  (select case when public.push_claim('test-secret-abc', :'alice_id', 'dedupe-1')
               then 1 else 0 end), 1);

-- A dead endpoint is dropped so we stop pushing at an uninstalled app.
select public.push_forget('test-secret-abc', 'https://push.example/alice') as forgotten \gset
reset role;
select pg_temp.check('push_forget removes the dead device',
  (select count(*) from public.push_subscriptions
   where endpoint = 'https://push.example/alice'), 0);

reset role;
\echo ''
\echo '── done. Any FAIL / WARNING above is a security bug. ──────────────────'
