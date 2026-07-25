# Setting up Family Hub

One-time setup, roughly 15 minutes. No coding required — it's clicking through
two websites and copying two values.

You'll create two free accounts:

| Service      | What it does for us              | Cost                  |
| ------------ | -------------------------------- | --------------------- |
| **Supabase** | Stores the data, handles sign-in | Free                  |
| **Vercel**   | Puts the app on the internet     | Free for personal use |

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> and sign up (easiest: **Continue with GitHub**).
2. Click **New project**.
3. Fill in:
   - **Name**: `family-hub`
   - **Database Password**: click *Generate a password* and save it in your
     password manager. You won't need it for this app, but you can't retrieve it
     later.
   - **Region**: whichever is closest to where your family lives.
4. Click **Create new project** and wait ~2 minutes while it provisions.

## Step 2 — Copy your two keys

1. In your project, go to **Project Settings** (gear icon) → **API**.
2. Leave this tab open. You need exactly two values:

   | Label in Supabase       | Looks like                          |
   | ----------------------- | ----------------------------------- |
   | **Project URL**         | `https://abcdefghijkl.supabase.co`  |
   | **anon** / **public** key | a very long string starting `eyJ…` |

> **Is it safe to expose these?** Yes. The `anon` key only lets someone *attempt*
> a request — the database's own security rules decide what they're actually
> allowed to see, and those rules are set up in the next step.
>
> If you also spot a **service_role** key: ignore it. It bypasses every security
> rule, and this app deliberately never uses it.

## Step 3 — Create the database tables

1. In Supabase, go to **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](./supabase/schema.sql) from this project, copy
   **all** of it, and paste it into the editor.
3. Click **Run**.

You should see *Success. No rows returned* — that's correct, it created tables,
not data.

This one script sets up all six tables plus the **Row-Level Security** rules
that make the database itself refuse to hand over another family's rows, even if
the app has a bug. Safe to re-run any time.

> **Already set this up before?** Re-run the script now — it changed to enable
> live updates between phones. Without the re-run, checking an item off on one
> phone will show up on the other, but *deleting* (clearing bought items) won't
> until the other phone refreshes.

## Step 4 — Set up the sign-in email

Family Hub signs you in with a link emailed to you — no password. Supabase sends
that email, but its default wording doesn't include a fallback code, so replace
both templates below.

Go to **Authentication** → **Emails** (older dashboards call this *Email
Templates*). There are two templates to update, because Supabase uses a
different one for a brand-new address than for a returning one.

**a) The "Magic Link" template** (used when you've signed in before). Replace the
message body with:

```html
<h2>Sign in to Family Hub</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">
    Tap here to sign in
  </a>
</p>
<p>Or type this code into the app: <strong>{{ .Token }}</strong></p>
<p style="color:#888;font-size:12px">This expires in 1 hour.</p>
```

**b) The "Confirm signup" template** (used the very first time an address signs
in). Same thing, but note `type=signup`:

```html
<h2>Welcome to Family Hub</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">
    Tap here to sign in
  </a>
</p>
<p>Or type this code into the app: <strong>{{ .Token }}</strong></p>
<p style="color:#888;font-size:12px">This expires in 1 hour.</p>
```

Click **Save** on each.

> **Why not just leave the default link?** The default sends the link through a
> flow that only completes in the *same browser* that requested it. Tapping a
> link in the Mail app doesn't reliably satisfy that, which shows up as
> "invalid request" errors. The link above is verified by our own app instead, so
> it works whichever app opens it.

> **Why the code as well?** On an iPhone, tapping the link opens Safari — which
> means you land signed-in *in Safari*, while the app on your home screen is
> still signed out. Typing the 6-digit code keeps you inside the installed app.
> Both work; the code is the smoother one once the app is on your home screen.

> **Email limits:** Supabase's built-in sender allows only a few messages per
> hour. Fine for a family signing in once per device, but if you test repeatedly
> you'll get rate-limited — just wait.

## Step 5 — Deploy to Vercel

1. Go to <https://vercel.com> and sign up with GitHub.
2. Click **Add New** → **Project** and import this repository.
3. **Before** clicking Deploy, expand **Environment Variables** and add both:

   | Name                            | Value                        |
   | ------------------------------- | ---------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | your Project URL from Step 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key         |

4. Click **Deploy** and wait ~2 minutes.
5. Vercel gives you a URL like `https://family-hub-xyz.vercel.app`. That's your
   app.

> Forgot the variables? The app will load but show "Missing environment
> variable". Add them under **Project Settings → Environment Variables**, then
> **Deployments → ⋯ → Redeploy**.

## Step 6 — Tell Supabase about your URL

Supabase only completes sign-ins for URLs you've approved, and the email
templates above use `{{ .SiteURL }}` — so this step is what makes the link point
at the right place.

1. In Supabase: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Vercel URL, with no trailing slash:
   `https://family-hub-xyz.vercel.app`
3. Under **Redirect URLs**, click *Add URL* and add both:
   - `https://family-hub-xyz.vercel.app/**`
   - `http://localhost:3000/**`
4. Save.

> Note that `{{ .SiteURL }}` in the email always uses the **Site URL** above. So
> a link emailed while Site URL points at Vercel will open the Vercel app even if
> you requested it from localhost. For local testing, use the 6-digit code.

---

## Install it on your iPhone

1. Open your Vercel URL in **Safari** (must be Safari — Chrome can't install).
2. Tap the **Share** button (square with an arrow pointing up).
3. Scroll down, tap **Add to Home Screen**, then **Add**.

You now have a Family Hub icon that opens without any browser bar, like a normal
app.

On Android: open the URL in Chrome, then **⋮ → Add to Home screen**.

---

## Running it on your own computer

Only needed if you want to try changes before they go live.

### What goes in `.env.local`

Create a file named exactly `.env.local` in the project root — same folder as
`package.json`. The fastest way:

```bash
cp .env.example .env.local
```

Then open it and paste your two values from Step 2 after the `=` signs, with no
quotes and no spaces:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-long-anon-key-here
```

| Variable                        | Where to copy it from                                          |
| ------------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API → **Project URL**            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → **anon** / **public** key  |

That's all — there is no third variable. `.env.local` is ignored by git, so your
keys never get committed.

### Then run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Sign in with the **6-digit code** rather than the
link (see the note in Step 6).

---

## Troubleshooting

| What you see                                     | What to do                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| "Missing environment variable…"                  | Step 5 — add both variables in Vercel, then redeploy.                          |
| Sign-in screen loads, but nothing else works     | Step 3 — the schema script probably wasn't run.                               |
| Email has a link but no 6-digit code             | Step 4 — the template still needs `{{ .Token }}`.                              |
| No email arrives                                 | Check spam. If you've signed in a few times this hour, wait — see Step 4.      |
| Tapping the link says "invalid request" / expired | Step 4 — the template must use the `token_hash` link shown there.              |
| Link opens the wrong site                        | Step 6 — **Site URL** is what `{{ .SiteURL }}` becomes.                        |
| "requested path is invalid" after tapping        | Step 6 — add your URL under **Redirect URLs**.                                 |
| Signed in on Safari but home-screen app is not   | Expected on iOS. Open the installed app and use the 6-digit code instead.      |
| Code rejected as invalid                         | Codes expire after an hour. Request a fresh one.                              |
| Stuck on "Set up your family"                    | Step 3 — `create_family` comes from the schema script.                        |
| Memos/Groceries show a red **Not live** dot      | The realtime socket isn't connected — see *Live updates* below.               |
| Changes appear only after a refresh              | Same as above.                                                               |
| Cleared items reappear on the other phone        | Step 3 — re-run the schema script (it sets `REPLICA IDENTITY FULL`).           |

---

## Live updates

The Memos and Groceries screens show a small dot in the top-right:

| Dot                | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| green **Live**     | Connected — changes from other phones arrive instantly.     |
| grey **Connecting…** | Still opening the connection. Normal for a second or two.  |
| red **Not live**    | Not connected. The screen still works, but you'll need to refresh to see others' changes. |

If it stays red:

1. **Check Realtime is on for the tables.** In Supabase go to **Database** →
   **Replication** (or **Publications**) → `supabase_realtime`, and make sure
   `memos` and `grocery_items` are enabled. The schema script does this, but the
   dashboard is where to confirm it.
2. **Re-run `supabase/schema.sql`** (Step 3) if you set the project up before
   this phase.
3. **Check the connection.** Realtime uses a websocket; some corporate or hotel
   Wi-Fi blocks them. Try mobile data.
