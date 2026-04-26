# Family Calendar

A small private web app for sharing a calendar across the family.
Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase** (Postgres) as the data layer.

> Status: scaffolding only. Event CRUD UI and the iCal subscription endpoint land in the next step.

## Tech stack

- Next.js 14 App Router + React 18
- TypeScript, Tailwind CSS, ESLint
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- `ical-generator` (for the upcoming `.ics` feed)
- `date-fns`, `zod`

## Local development

### 1. Prerequisites

- Node.js 18.17+ (Node 20 LTS recommended)
- A Supabase project (free tier is fine)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the template and fill in values:

```bash
cp .env.example .env.local
```

| Key | Where to find it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | Exposed to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → `anon` `public` key | Exposed to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` `secret` key | **Server only** — bypasses RLS, must never reach the browser |
| `CALENDAR_SUBSCRIPTION_TOKEN` | Generate any random string (`openssl rand -hex 32`) | Shared secret for the future iCal subscription URL |

`.env.local` is gitignored. `.env.example` is the committed template — keep it in sync when you add new variables.

### 4. Apply the database schema

The schema lives in [`supabase/schema.sql`](./supabase/schema.sql).

The simplest way to apply it:

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of `supabase/schema.sql` and click **Run**.

This creates the `events` table, the `start_at` / `end_at` indexes, and the `updated_at` auto-update trigger. The script is idempotent (`if not exists` / `create or replace`), so you can re-run it safely.

If you use the Supabase CLI instead, you can pipe the file in:

```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. The home page is a healthcheck — it tries to read the `events` table and shows whether the Supabase connection is working.

## Project layout

```
app/                  Next.js App Router pages and layouts
  page.tsx            Healthcheck home page
  layout.tsx          Root layout
lib/supabase/
  client.ts           Browser Supabase client (anon key)
  server.ts           Server Supabase client (service-role key)
supabase/
  schema.sql          Database schema (apply via SQL Editor)
.env.example          Template for required environment variables
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
