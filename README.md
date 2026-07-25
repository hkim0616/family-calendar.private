# Family Hub

A private, mobile-first app for one family to share memos, a calendar, a
grocery list and anniversaries. Installs to a phone's home screen like a native
app.

**Setting it up for the first time? → [SETUP.md](./SETUP.md)**

## Tech stack

- **Next.js 14** (App Router) + React 18 + TypeScript
- **Tailwind CSS** for styling
- **Supabase** — Postgres database, email sign-in, Realtime
- **Vercel** for hosting
- Installable PWA (web manifest + service worker)

## Build phases

| Phase  | Scope                                                      | Status      |
| ------ | ---------------------------------------------------------- | ----------- |
| **P0** | PWA shell, magic-link sign-in, schema + security, create-a-family, home screen | ✅ Done |
| **P1** | Memos board + live grocery list, join-a-family by invite code | ✅ Done   |
| **P2** | Schedule (month + agenda) + .ics subscription feed          | ✅ Done     |
| **P3** | Anniversaries with lead-time reminders                     | Not started |
| **P4** | Home dashboard & final PWA polish                          | Not started |

## How the data is protected

Every row belongs to exactly one `family_id`, and **Row-Level Security** (RLS)
policies in Postgres enforce that a signed-in user can only read and write rows
for families they're a member of. This is enforced by the database, not by the
app — so a bug in the UI can't leak another family's data.

Two deliberate choices back that up:

1. **No service-role key.** The app only ever uses Supabase's public `anon` key,
   which is subject to RLS. The service-role key bypasses RLS entirely, so it is
   never added to the project at all.
2. **Joining a family goes through vetted functions.** No policy lets you insert
   yourself into an arbitrary family. `create_family()` and `join_family()` are
   the only ways in, and each validates its input.

### Verifying it

[`supabase/tests/rls-test.sql`](./supabase/tests/rls-test.sql) sets up two
unrelated families and asserts that neither can see or modify the other's memos,
events, groceries, anniversaries, members or invite code. Run it against a
throwaway Postgres 16 database after any schema change:

```bash
initdb -D /tmp/pgtest -U postgres --auth=trust
pg_ctl -D /tmp/pgtest -o '-p 55432 -k /tmp' start
psql -h /tmp -p 55432 -U postgres -f supabase/tests/rls-test.sql
```

Every assertion should print `PASS`.

## Data model

All content tables carry a `family_id`.

| Table           | Purpose                                     |
| --------------- | ------------------------------------------- |
| `families`      | One household, plus its invite code         |
| `members`       | A person in a family, linked to their login |
| `memos`         | Shared notes / to-dos, with a done flag     |
| `events`        | Shared calendar entries                     |
| `grocery_items` | Shopping list, with a checked flag          |
| `anniversaries` | Yearly dates with a reminder lead time      |

### Live updates

`memos`, `grocery_items` and `events` are published to Supabase Realtime, so changes
appear on other phones without a refresh. Two details make that actually work:

- **`REPLICA IDENTITY FULL`** on both tables. By default Postgres reports only
  the primary key of a deleted row, so a subscriber filtering on `family_id`
  would never receive deletions — "clear bought items" would appear to do
  nothing on the other phone until a refresh.
- **`realtime.setAuth()` before subscribing** (`lib/use-realtime-list.ts`).
  Without the user's token the socket connects anonymously, RLS correctly
  filters out every row, and the stream looks silently dead.

Screens fetch their first page server-side for a fast paint, then
`useRealtimeList` takes over. Writes are optimistic and roll back on error; the
merge is keyed by row id so our own write and its realtime echo can't produce a
duplicate.

## The calendar subscription feed

`GET /api/calendar/<calendar_token>.ics` returns one family's events as an
iCalendar feed. It is the **only unauthenticated route in the app**, because a
subscribing calendar app cannot log in — Apple's servers fetch the URL with no
cookies, so the URL itself has to carry the credential.

How that stays safe:

- The token is a random UUID (122 bits), stored on `families.calendar_token`,
  and separate from `invite_code` — one grants read-only calendar access, the
  other grants full family membership.
- Reads go through the `calendar_feed()` SECURITY DEFINER function, which is
  scoped to the single family matching the token. **No service-role key is
  involved**, so the invariant from P0 holds: nothing in this app can bypass RLS
  wholesale.
- The route is read-only, rejects malformed tokens before touching the database,
  and sends `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- `reset_calendar_token()` rotates the token, revoking any link that leaked.
- `supabase/tests/rls-test.sql` asserts that one family's token never returns
  another's events, that `anon` still cannot read the `events` table directly,
  that a signed-out caller cannot rotate a token, and that rotation invalidates
  the old link.

The feed is built by `lib/ics.ts` rather than a library, because RFC 5545 has a
few rules that fail *silently* when broken — a calendar app just refuses to
subscribe. `lib/ics.test.ts` covers CRLF endings, 75-octet line folding that
never splits a multi-byte character, TEXT escaping order, and the exclusive
DTEND for all-day events. The generated output is additionally validated against
the independent `icalendar` Python parser.

### How event times are stored

- **Timed** events store a real instant, and are displayed and grouped in the
  viewer's local timezone.
- **All-day** events store UTC midnight of the first and last day (inclusive),
  and are grouped by their *UTC* date. Storing local midnight instead would make
  a date created in Seoul read as the previous day further west.

`lib/calendar.test.ts` runs green in eight timezones spanning both sides of the
date line, including half-hour offsets.

## Project layout

```
app/
  (app)/                     Signed-in screens, wrapped in the tab bar
    page.tsx                 Home (greeting, counts, invite code)
    memos/                   Memos board
    schedule/                Month + agenda calendar, .ics subscribe card
    groceries/               Live grocery list
  api/calendar/[token]/      Public read-only .ics feed
  onboarding/                Create-or-join-a-family screen + server actions
  login/page.tsx             Magic-link sign-in (with code fallback)
  offline/page.tsx           Shown when the phone has no connection
  auth/callback/route.ts     Verifies the link from the sign-in email
  auth/signout/route.ts      Sign out
  layout.tsx                 Root layout, PWA metadata
  globals.css                Design tokens (light + dark)
components/
  bottom-nav.tsx             Tab bar
  invite-code.tsx            Invite code with tap-to-copy
  live-badge.tsx             Realtime connection indicator
  service-worker-registrar.tsx
lib/
  calendar.ts                Month grid, day grouping (unit-tested)
  env.ts                     Reads env vars with helpful errors
  family.ts                  Current member + family lookup
  ics.ts                     iCalendar feed builder (unit-tested)
  realtime-merge.ts          Pure list-merge helpers (unit-tested)
  time.ts                    Short timestamps for list rows
  use-realtime-list.ts       Realtime subscription hook
  supabase/client.ts         Browser client (cached singleton)
  supabase/server.ts         Server client (respects RLS)
  supabase/middleware.ts     Session refresh + route protection
middleware.ts                Runs the above on every request
public/
  manifest.webmanifest       Makes the app installable
  sw.js                      Service worker
  icons/                     App icons
supabase/
  schema.sql                 Tables, security policies, functions
  tests/rls-test.sql         Security regression test
```

## Scripts

| Command         | Description                            |
| --------------- | -------------------------------------- |
| `npm run dev`   | Dev server on port 3000                |
| `npm run build` | Production build                       |
| `npm run start` | Serve the production build             |
| `npm run lint`  | ESLint                                 |
| `npm test`      | Unit tests: realtime merge, calendar, iCal |

## Notes

- **Sign-in is a magic link, with a 6-digit code as a second option in the same
  email.** The link is verified server-side at `/auth/callback` from a
  `token_hash`, rather than via the PKCE `?code=` flow, so it works no matter
  which browser opens it — tapping a link in the iOS Mail app doesn't reliably
  return to the browser that requested it. The code exists because on iOS a link
  always opens Safari, leaving the installed home-screen app still signed out.
- **First login routes through `/onboarding`.** `app/page.tsx` redirects there
  when the signed-in user has no `members` row yet. Creating the family goes
  through the `create_family()` database function so the `families` and `members`
  rows can't half-succeed, and so no RLS policy has to permit inserting yourself
  into an arbitrary family.
- **The service worker doesn't cache pages or data** — only static assets and an
  offline notice. Cached HTML is how PWAs end up showing stale lists or the
  wrong person's signed-in screen.
