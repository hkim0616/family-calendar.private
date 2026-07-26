-- ═══════════════════════════════════════════════════════════════════════════
-- Family Hub — database schema
--
-- Apply this by pasting the whole file into:
--   Supabase Dashboard → SQL Editor → New query → Run
--
-- Safe to re-run: everything is written to be idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────────────────
-- Helper: keep updated_at fresh on every UPDATE
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- A household. Every other row in the database belongs to exactly one family.
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Short code family members type in to join. Handed out by the owner.
  invite_code text not null unique
                default upper(encode(gen_random_bytes(4), 'hex')),
  created_at  timestamptz not null default now()
);

-- Secret used by the read-only .ics calendar feed.
--
-- Calendar subscriptions can't log in — Apple's servers fetch the URL with no
-- cookies — so the URL itself has to carry the credential. This is a random
-- 122-bit value, not guessable, and can be reset from the app if a link leaks.
-- Separate from invite_code on purpose: one grants read-only calendar access,
-- the other grants full membership.
alter table public.families
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists families_calendar_token_idx
  on public.families (calendar_token);

-- A person in a family, linked to their login (auth.users).
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  role         text not null default 'member'
                 check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  -- One membership row per person per family.
  unique (family_id, auth_user_id)
);

create index if not exists members_auth_user_id_idx on public.members (auth_user_id);
create index if not exists members_family_id_idx    on public.members (family_id);

-- Shared board of short notes / to-dos.
create table if not exists public.memos (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  author_id  uuid references public.members (id) on delete set null,
  body       text not null check (length(trim(body)) > 0),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memos_family_created_idx
  on public.memos (family_id, created_at desc);

-- Shared calendar events.
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  all_day    boolean not null default false,
  note       text,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An event can't finish before it starts.
  check (ends_at >= starts_at)
);

create index if not exists events_family_starts_idx
  on public.events (family_id, starts_at);

-- Live shared shopping list.
create table if not exists public.grocery_items (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  checked    boolean not null default false,
  added_by   uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists grocery_items_family_created_idx
  on public.grocery_items (family_id, created_at);

-- Recurring yearly dates (birthdays, wedding anniversaries…).
create table if not exists public.anniversaries (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families (id) on delete cascade,
  title              text not null check (length(trim(title)) > 0),
  date               date not null,
  remind_days_before integer not null default 7
                       check (remind_days_before between 0 and 365),
  created_at         timestamptz not null default now()
);

create index if not exists anniversaries_family_idx
  on public.anniversaries (family_id);


-- ───────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists memos_set_updated_at on public.memos;
create trigger memos_set_updated_at
  before update on public.memos
  for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY
--
-- Row-Level Security (RLS) makes Postgres itself refuse to hand over rows
-- that don't belong to the logged-in user's family. It is enforced even if
-- the app has a bug, so it is the real security boundary — not the UI.
-- ═══════════════════════════════════════════════════════════════════════════

-- Which families does the current logged-in user belong to?
--
-- SECURITY DEFINER means this function runs with the table owner's rights, so
-- it can read `members` without RLS applying. That matters for two reasons:
--   1. It avoids infinite recursion when the policy ON members calls it.
--   2. It keeps the policies below to a single fast subquery.
create or replace function public.my_family_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from public.members where auth_user_id = auth.uid();
$$;

revoke all on function public.my_family_ids() from public;
grant execute on function public.my_family_ids() to authenticated;

alter table public.families      enable row level security;
alter table public.members       enable row level security;
alter table public.memos         enable row level security;
alter table public.events        enable row level security;
alter table public.grocery_items enable row level security;
alter table public.anniversaries enable row level security;

-- ── families ──────────────────────────────────────────────────────────────
-- Readable only by its own members. Created/joined through the RPCs below,
-- so there is deliberately no INSERT policy.
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select to authenticated
  using (id in (select public.my_family_ids()));

drop policy if exists families_update on public.families;
create policy families_update on public.families
  for update to authenticated
  using (id in (select public.my_family_ids()))
  with check (id in (select public.my_family_ids()));

-- ── members ───────────────────────────────────────────────────────────────
-- You can see everyone in your family, and rename yourself.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (family_id in (select public.my_family_ids()));

drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ── the four content tables ───────────────────────────────────────────────
-- Same rule everywhere: full read/write inside your own family, nothing
-- outside it. `using` guards existing rows; `with check` guards new/edited
-- ones, which is what stops someone writing a row into another family.
drop policy if exists memos_all on public.memos;
create policy memos_all on public.memos
  for all to authenticated
  using (family_id in (select public.my_family_ids()))
  with check (family_id in (select public.my_family_ids()));

drop policy if exists events_all on public.events;
create policy events_all on public.events
  for all to authenticated
  using (family_id in (select public.my_family_ids()))
  with check (family_id in (select public.my_family_ids()));

drop policy if exists grocery_items_all on public.grocery_items;
create policy grocery_items_all on public.grocery_items
  for all to authenticated
  using (family_id in (select public.my_family_ids()))
  with check (family_id in (select public.my_family_ids()));

drop policy if exists anniversaries_all on public.anniversaries;
create policy anniversaries_all on public.anniversaries
  for all to authenticated
  using (family_id in (select public.my_family_ids()))
  with check (family_id in (select public.my_family_ids()));


-- ═══════════════════════════════════════════════════════════════════════════
-- JOINING / CREATING A FAMILY
--
-- These two are SECURITY DEFINER functions rather than plain INSERTs because
-- of a chicken-and-egg problem: to write a `members` row for family X you'd
-- normally need to already be a member of family X. These functions are the
-- only sanctioned way in, and each one validates before writing.
-- ═══════════════════════════════════════════════════════════════════════════

-- Create a brand-new family and make the caller its owner.
create or replace function public.create_family(family_name text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(trim(family_name), '') = '' then
    raise exception 'Family name is required';
  end if;
  if coalesce(trim(display_name), '') = '' then
    raise exception 'Your name is required';
  end if;

  insert into public.families (name)
  values (trim(family_name))
  returning id into new_family_id;

  insert into public.members (family_id, auth_user_id, name, role)
  values (new_family_id, auth.uid(), trim(display_name), 'owner');

  return new_family_id;
end;
$$;

-- Join an existing family using its invite code.
create or replace function public.join_family(code text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(trim(display_name), '') = '' then
    raise exception 'Your name is required';
  end if;

  select id into target_family_id
  from public.families
  where invite_code = upper(trim(code));

  if target_family_id is null then
    raise exception 'That invite code does not match any family';
  end if;

  insert into public.members (family_id, auth_user_id, name, role)
  values (target_family_id, auth.uid(), trim(display_name), 'member')
  on conflict (family_id, auth_user_id) do nothing;

  return target_family_id;
end;
$$;

revoke all on function public.create_family(text, text) from public;
revoke all on function public.join_family(text, text)   from public;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text)   to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME
--
-- Adds the two live-updating tables to Supabase's realtime broadcast, so a
-- checkbox ticked on one phone shows up on another without a refresh.
-- RLS still applies to realtime, so only your own family's changes arrive.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'grocery_items'
  ) then
    alter publication supabase_realtime add table public.grocery_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'memos'
  ) then
    alter publication supabase_realtime add table public.memos;
  end if;
end
$$;

-- Events too, so a new entry shows up on the other phone without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end
$$;

-- By default Postgres only reports the primary key of a DELETEd row. That
-- breaks two things at once for live updates:
--
--   1. Subscribers filter on family_id, and a delete event carrying only `id`
--      has no family_id to match — so deletions would silently never reach
--      other phones ("clear bought items" would appear to do nothing until
--      someone refreshed).
--   2. RLS can't be evaluated on a row it can't see the family_id of.
--
-- REPLICA IDENTITY FULL includes the whole old row, fixing both. The cost is
-- slightly larger write-ahead logs, which is irrelevant at family scale.
alter table public.memos         replica identity full;
alter table public.grocery_items replica identity full;
alter table public.events        replica identity full;


-- ═══════════════════════════════════════════════════════════════════════════
-- CALENDAR SUBSCRIPTION FEED
--
-- Read-only access to one family's events, authorised by the family's
-- calendar_token instead of a login session, because a subscribing calendar app
-- cannot log in.
--
-- SECURITY DEFINER (like create_family / join_family) is what lets this work
-- without ever introducing the Supabase service-role key: the function is a
-- narrow, read-only window keyed on an unguessable token, rather than a key
-- that bypasses RLS everywhere.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.calendar_feed(token uuid)
returns table (
  family_name text,
  event_id    uuid,
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  all_day     boolean,
  note        text,
  updated_at  timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  -- LEFT JOIN so a family with no events still yields its name, letting the
  -- endpoint tell "wrong token" apart from "empty calendar".
  select f.name, e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.note, e.updated_at
  from public.families f
  left join public.events e on e.family_id = f.id
  where f.calendar_token = token
  order by e.starts_at
  limit 5000;
$$;

-- Deliberately granted to `anon`: the calendar app fetching the feed is not
-- signed in. The token in the URL is the entire authorisation.
revoke all on function public.calendar_feed(uuid) from public;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;

-- Rotate the token, invalidating any subscription link that has leaked.
create or replace function public.reset_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update public.families
  set calendar_token = gen_random_uuid()
  where id in (select public.my_family_ids())
  returning calendar_token into new_token;

  if new_token is null then
    raise exception 'You are not a member of any family';
  end if;

  return new_token;
end;
$$;

revoke all on function public.reset_calendar_token() from public;
grant execute on function public.reset_calendar_token() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per phone that has agreed to receive notifications.
--
-- `endpoint` is a capability URL issued by Apple or Google: whoever holds it can
-- push to that device. It is treated as a secret — members can only ever see
-- their own rows, not their family's.
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families (id) on delete cascade,
  member_id       uuid not null references public.members (id) on delete cascade,
  endpoint        text not null unique,
  -- The browser's public key and auth secret, needed to encrypt each payload.
  p256dh          text not null,
  auth            text not null,
  -- Just for the settings screen: "iPhone", "Mac"…
  device_label    text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_family_idx
  on public.push_subscriptions (family_id);

-- Ledger of what has already been sent, so a notification can't go out twice.
-- The unique dedupe_key is the mechanism: claiming a key and sending are two
-- steps, and the claim fails if another run already took it.
create table if not exists public.push_sends (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  dedupe_key text not null unique,
  sent_at    timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_sends         enable row level security;

-- Members manage only their own devices. There is deliberately no policy that
-- lets one member read another's endpoint.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (
    member_id in (
      select id from public.members where auth_user_id = auth.uid()
    )
  )
  with check (
    member_id in (
      select id from public.members where auth_user_id = auth.uid()
    )
    and family_id in (select public.my_family_ids())
  );

-- push_sends is bookkeeping for the scheduler. No client needs to read it, so
-- RLS is enabled with no policy at all: that denies everything by default.


-- ───────────────────────────────────────────────────────────────────────────
-- Scheduler access
--
-- The nightly job runs as nobody — it has no login session — so it can't rely
-- on RLS. Instead it presents a shared secret, and these SECURITY DEFINER
-- functions check it before returning anything.
--
-- This is the same shape as the calendar feed: a narrow, purpose-built window
-- guarded by a high-entropy secret, rather than a service-role key that would
-- bypass RLS across the whole database.
-- ───────────────────────────────────────────────────────────────────────────

-- Holds the scheduler secret. Locked down: no policy, so no client can read it.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;

create or replace function public.check_scheduler_secret(secret text)
returns void
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  expected text;
begin
  select value into expected from public.app_config where key = 'push_cron_secret';

  if expected is null then
    raise exception 'Scheduler secret is not configured';
  end if;

  -- Compare digests so the comparison cost doesn't depend on how many leading
  -- characters happen to match.
  if digest(coalesce(secret, ''), 'sha256') is distinct from digest(expected, 'sha256') then
    raise exception 'Unauthorized';
  end if;
end;
$$;

-- Everything the scheduler needs, in one call: each family with its
-- anniversaries, how much is on the shopping list, and where to push.
create or replace function public.push_due(secret text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.check_scheduler_secret(secret);

  select coalesce(jsonb_agg(family), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'family_id', f.id,
      'family_name', f.name,
      'anniversaries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'date', a.date,
          'remind_days_before', a.remind_days_before
        ))
        from public.anniversaries a
        where a.family_id = f.id
      ), '[]'::jsonb),
      'grocery_to_buy', (
        select count(*) from public.grocery_items g
        where g.family_id = f.id and g.checked = false
      ),
      'subscriptions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'endpoint', s.endpoint,
          'p256dh', s.p256dh,
          'auth', s.auth
        ))
        from public.push_subscriptions s
        where s.family_id = f.id
      ), '[]'::jsonb)
    ) as family
    from public.families f
    -- Skip families with nobody to notify.
    where exists (
      select 1 from public.push_subscriptions s where s.family_id = f.id
    )
  ) families;

  return result;
end;
$$;

-- Claims a dedupe key. Returns true if this run got it, false if an earlier run
-- already sent that notification.
create or replace function public.push_claim(
  secret text,
  target_family_id uuid,
  key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_scheduler_secret(secret);

  insert into public.push_sends (family_id, dedupe_key)
  values (target_family_id, key)
  on conflict (dedupe_key) do nothing;

  return found;
end;
$$;

-- Releases a claim, so a notification that failed to reach anyone is retried on
-- the next run rather than being silently swallowed.
create or replace function public.push_release(secret text, key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_scheduler_secret(secret);
  delete from public.push_sends where dedupe_key = key;
end;
$$;

-- Drops a subscription the push service has told us is gone (HTTP 404 / 410),
-- so we stop trying to reach an uninstalled app forever.
create or replace function public.push_forget(secret text, dead_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_scheduler_secret(secret);
  delete from public.push_subscriptions where endpoint = dead_endpoint;
end;
$$;

-- Records that a device was reached, which is what the settings screen shows.
create or replace function public.push_touch(secret text, live_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_scheduler_secret(secret);
  update public.push_subscriptions
  set last_success_at = now()
  where endpoint = live_endpoint;
end;
$$;

-- These are reachable with the public anon key, so each one re-checks the
-- shared secret itself. Without the secret they return nothing and raise.
revoke all on function public.check_scheduler_secret(text) from public;
revoke all on function public.push_due(text)               from public;
revoke all on function public.push_claim(text, uuid, text)  from public;
revoke all on function public.push_release(text, text)      from public;
revoke all on function public.push_forget(text, text)       from public;
revoke all on function public.push_touch(text, text)        from public;

grant execute on function public.push_due(text)              to anon, authenticated;
grant execute on function public.push_claim(text, uuid, text) to anon, authenticated;
grant execute on function public.push_release(text, text)     to anon, authenticated;
grant execute on function public.push_forget(text, text)      to anon, authenticated;
grant execute on function public.push_touch(text, text)       to anon, authenticated;
