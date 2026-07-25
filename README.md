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
| **P1** | Members: invite others, join by code, manage the roster     | Not started |
| **P2** | Memos & grocery list, both updating live                   | Not started |
| **P3** | Schedule (month + agenda) & anniversary reminders          | Not started |
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

`memos` and `grocery_items` are published to Supabase Realtime, so changes
appear on other phones without a refresh.

## Project layout

```
app/
  page.tsx                   Home screen (greeting + family name)
  onboarding/                "Create your family" screen + server action
  login/page.tsx             Magic-link sign-in (with code fallback)
  offline/page.tsx           Shown when the phone has no connection
  auth/callback/route.ts     Verifies the link from the sign-in email
  auth/signout/route.ts      Sign out
  layout.tsx                 Root layout, PWA metadata
  globals.css                Design tokens (light + dark)
components/
  service-worker-registrar.tsx
lib/
  env.ts                     Reads env vars with helpful errors
  supabase/client.ts         Browser client
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

| Command         | Description                |
| --------------- | -------------------------- |
| `npm run dev`   | Dev server on port 3000    |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | ESLint                     |

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
