-- Family Calendar — initial schema
-- Apply via Supabase Dashboard → SQL Editor, or `supabase db push` if using the CLI.

-- gen_random_uuid() lives in pgcrypto; Supabase enables it by default,
-- but we make it explicit so this file is self-contained.
create extension if not exists "pgcrypto";

-- Trigger function: keep updated_at in sync on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  location    text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  rrule       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists events_end_at_idx   on public.events (end_at);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();
