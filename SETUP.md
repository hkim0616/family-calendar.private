# Setting up Family Hub

One-time setup, roughly 15 minutes. No coding required — it's all clicking
through two websites and copying three values.

You'll create two free accounts:

| Service      | What it does for us              | Cost                    |
| ------------ | -------------------------------- | ----------------------- |
| **Supabase** | Stores the data, handles sign-in | Free                    |
| **Vercel**   | Puts the app on the internet     | Free for personal use   |

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> and sign up (use "Continue with GitHub").
2. Click **New project**.
3. Fill in:
   - **Name**: `family-hub`
   - **Database Password**: click *Generate a password* and save it in your
     password manager. You won't need it for this app, but you can't get it
     back later.
   - **Region**: pick the one closest to where your family lives.
4. Click **Create new project** and wait ~2 minutes while it provisions.

## Step 2 — Copy your two keys

1. In your project, go to **Project Settings** (gear icon) → **API**.
2. Keep this tab open. You need two values:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon public** key — a very long string

> **Is it safe to expose these?** Yes. The `anon` key only lets someone attempt
> a request; the database's own security rules decide what they're actually
> allowed to see. Those rules are set up in the next step.
>
> If you also see a **service_role** key: ignore it. It bypasses all security
> rules and this app deliberately never uses it.

## Step 3 — Create the database tables

1. In Supabase, go to **SQL Editor** → **New query**.
2. Open the file [`supabase/schema.sql`](./supabase/schema.sql) from this
   project, copy **all** of it, and paste it into the editor.
3. Click **Run**.

You should see *Success. No rows returned*. That's correct — it created tables,
not data.

This one script sets up all six tables and, importantly, the **Row-Level
Security** rules. Those rules make the database itself refuse to hand over
another family's rows, even if the app has a bug. It's safe to re-run at any
time.

## Step 4 — Make the sign-in email include a code

Family Hub signs you in with a 6-digit code emailed to you, rather than a
"magic link". On an iPhone, tapping a link in Mail opens Safari, which would
kick you out of the installed app — typing a code keeps you inside it.

Supabase's default email only contains a link, so add the code to it:

1. Go to **Authentication** → **Emails** (older dashboards: *Email Templates*).
2. Select the **Magic Link** template.
3. Replace the message body with:

   ```html
   <h2>Your Family Hub sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>It expires in 1 hour.</p>
   <p style="color:#888;font-size:12px">
     Or <a href="{{ .ConfirmationURL }}">tap here</a> if you'd rather use a link.
   </p>
   ```

4. Click **Save**.

> **Heads up on email limits:** Supabase's built-in email sender allows only a
> few messages per hour. That's fine for a family signing in once per device,
> but if you're testing repeatedly you may get rate-limited — just wait a bit.

## Step 5 — Deploy to Vercel

1. Go to <https://vercel.com> and sign up with GitHub.
2. Click **Add New** → **Project** and import this repository.
3. Before clicking Deploy, expand **Environment Variables** and add both:

   | Name                            | Value                          |
   | ------------------------------- | ------------------------------ |
   | `NEXT_PUBLIC_SUPABASE_URL`      | your Project URL from Step 2   |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key           |

4. Click **Deploy** and wait ~2 minutes.
5. Vercel gives you a URL like `https://family-hub-xyz.vercel.app`. That's your
   app — send it to your family later.

> If you forget the environment variables, the app will load but show an error
> about a missing variable. Add them under **Project Settings → Environment
> Variables**, then **Deployments → ⋯ → Redeploy**.

## Step 6 — Allow your Vercel URL to sign people in

Supabase only accepts sign-ins coming from URLs you approve.

1. In Supabase: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Vercel URL (e.g. `https://family-hub-xyz.vercel.app`).
3. Under **Redirect URLs**, click *Add URL* and add:
   - `https://family-hub-xyz.vercel.app/**`
   - `http://localhost:3000/**` (so it also works on your computer)
4. Save.

---

## Install it on your iPhone

1. Open your Vercel URL in **Safari** (this only works in Safari, not Chrome).
2. Tap the **Share** button (square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

You now have a Family Hub icon on your home screen that opens without any
browser chrome, like a normal app.

On Android, open the URL in Chrome and use **⋮ → Add to Home screen**.

---

## Running it on your own computer (optional)

Only needed if you want to try changes before they go live.

```bash
npm install
cp .env.example .env.local     # then paste your two values into .env.local
npm run dev
```

Open <http://localhost:3000>.

`.env.local` is ignored by git, so your keys never get committed.

---

## Troubleshooting

| What you see                                   | What to do                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| "Missing environment variable…"                | Step 5 — add both variables in Vercel, then redeploy.                       |
| Home screen says **Database: Problem**         | Step 3 — the schema script probably wasn't run.                            |
| The email has a link but no 6-digit code       | Step 4 — the email template still needs `{{ .Token }}`.                     |
| No email arrives                               | Check spam. If you've signed in several times in an hour, wait — see Step 4. |
| "Email address not authorized" / redirect error| Step 6 — add your Vercel URL to Supabase's allowed URLs.                    |
| Code is rejected as invalid                    | Codes expire after an hour. Tap *Use a different email* and request a new one. |
