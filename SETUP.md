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

> **Already set this up before? Re-run the script.** It has gained the calendar
> subscription feed and, most recently, the tables that store which phones get
> notifications. Re-running is always safe.

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
> still signed out. Typing the code keeps you inside the installed app.
> Both work; the code is the smoother one once the app is on your home screen.

> **Email limits:** Supabase's built-in sender allows only a few messages per
> hour. Fine for a family signing in once per device, but if you test repeatedly
> you'll get rate-limited — just wait.

## Step 4b — Connect a real email service

**Do this before anyone else signs in.** Supabase's built-in email sender is for
testing only: it allows as few as **2–4 messages per hour across the whole
project**, and its messages often land in spam. Since every person needs an
email each time they sign in on a new device, a family will hit that wall
immediately — the symptom is `email rate limit exceeded`.

Connecting your own sender takes about five minutes and is free at family
volumes.

### Get a sending key

1. Sign up at <https://resend.com> and verify your email address.
2. Go to **API Keys** → **Create API Key** → copy it.

### Point Supabase at it

In the **left sidebar** under **Authentication** → **Emails** → **SMTP
Settings** tab. (SMTP is *not* under Project Settings in current dashboards.)
Direct link:

```
https://supabase.com/dashboard/project/<your-project-ref>/auth/smtp
```

Turn on **Enable Custom SMTP** and fill in:

| Field         | Value                    |
| ------------- | ------------------------ |
| Host          | `smtp.resend.com`        |
| Port          | `465`                    |
| Username      | `resend`                 |
| Password      | your Resend API key      |
| Sender email  | `onboarding@resend.dev`  |
| Sender name   | `Family Hub`             |

**Save.**

> `onboarding@resend.dev` is Resend's shared test sender. It works with no
> domain setup, but it only delivers to the address you signed up with — fine
> for getting yourself in, not enough for the rest of the family. Before they
> join, either verify a domain in Resend (**Domains → Add Domain**) and use an
> address on it, or use another provider.

### Raise the limit

**Authentication** → **Rate Limits** → set emails per hour to something sane
like 30:

```
https://supabase.com/dashboard/project/<your-project-ref>/auth/rate-limits
```

> **Already hit the limit?** It's a rolling window — wait about an hour, or
> configure SMTP above, which resets the constraint immediately.

## Step 5 — Deploy to Vercel

> **First, check which branch is your default.** Vercel builds your repository's
> default branch. If that branch is an old one, you will deploy an old app and
> spend a long time wondering why. On GitHub: **Settings → General → Default
> branch** — it should be the branch holding the finished app. Change it there
> if not, or override it later in Vercel under **Settings → Git → Production
> Branch**.

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

> **A successful build does not mean it's configured.** The app builds fine
> with no environment variables at all — it only complains when someone opens
> it, with "Missing environment variable". If that happens, add them under
> **Project Settings → Environment Variables**, then **Deployments → ⋯ →
> Redeploy**. Environment variables are read at build time, so a redeploy is
> always required after adding or changing one.

> Use the **stable** production URL (`your-project.vercel.app`), not the long
> per-deployment one (`your-project-a1b2c3-you.vercel.app`). The per-deployment
> URL changes with every push, which would break sign-in and everyone's
> home-screen icon.

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
> you requested it from localhost. For local testing, use the emailed code.

---

## Install it on your iPhone

1. Open your Vercel URL in **Safari** (must be Safari — Chrome can't install).
2. Tap the **Share** button (square with an arrow pointing up), in the toolbar
   at the bottom of the screen.
3. Scroll down the list, tap **Add to Home Screen**, then **Add** (top right).

You now have a Family Hub icon that opens without any browser bar, like a normal
app.

On Android: open the URL in Chrome, then **⋮ → Add to Home screen**.

> **Sharing the link over a messaging app?** KakaoTalk, LINE, Instagram and
> similar open links inside their own built-in browser, which **cannot install
> anything to the Home Screen** and keeps its own separate login. Tell whoever
> you send it to: open the link, then use the in-app browser's menu to
> **Open in Safari** first, and do the Add to Home Screen from there.

---

## Inviting the rest of the family

On the Home screen, under **Invite your family**, tap **Share invite link** —
that opens your phone's share sheet, so you can send it straight to KakaoTalk,
Messages or anywhere else. **Copy invite link** is there if you'd rather paste
it yourself.

Whoever receives it taps the link, signs in with their own email, and lands on
a join screen with the family code already filled in — they only add their
name. The code is still shown underneath the link, for reading out loud or
typing on a device that can't open it.

> **They need to be able to receive email.** Each person signs in with their own
> address, so if you're still on the built-in Supabase sender — or on Resend's
> shared `onboarding@resend.dev`, which only delivers to your own address —
> nobody else will get their sign-in email. See Step 4b.

> The invite link works for anyone who has it, so keep it to the people you mean
> to add. If it gets somewhere you didn't intend, the family's code can be
> changed by re-running the `families` insert — ask and I'll add a rotate
> button.

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

Open <http://localhost:3000>. Sign in with the **emailed code** rather than the
link (see the note in Step 6).

---

## Troubleshooting

| What you see                                     | What to do                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| "Missing environment variable…"                  | Step 5 — add both variables in Vercel, then redeploy.                          |
| Sign-in screen loads, but nothing else works     | Step 3 — the schema script probably wasn't run.                               |
| Email has a link but no code                     | Step 4 — the template still needs `{{ .Token }}`.                              |
| The code is longer than the box allows           | Fixed — the app accepts 6–10 digits. You can also set the length under **Authentication → Providers → Email → Email OTP Length**. |
| No email arrives                                 | Check spam. If you've signed in a few times this hour, wait — see Step 4b.     |
| `email rate limit exceeded`                      | Step 4b — the built-in sender allows only a few per hour. Connect real SMTP.    |
| Tapping the link says "invalid request" / expired | Step 4 — the template must use the `token_hash` link shown there.              |
| Link opens the wrong site                        | Step 6 — **Site URL** is what `{{ .SiteURL }}` becomes.                        |
| "requested path is invalid" after tapping        | Step 6 — add your URL under **Redirect URLs**.                                 |
| Signed in on Safari but home-screen app is not   | Expected on iOS. Open the installed app and use the emailed code instead.      |
| Code rejected as invalid                         | Codes expire after an hour. Request a fresh one.                              |
| Stuck on "Set up your family"                    | Step 3 — `create_family` comes from the schema script.                        |
| A date isn't on Home yet                         | Home shows the next 30 days only. The Dates tab lists everything.              |
| No "Reminders" card on the Home screen           | Step 7b — the VAPID keys aren't in Vercel yet, or it needs a redeploy.          |
| iPhone shows "add to Home Screen first"          | Step 7f — Apple only allows notifications for installed apps. Open it from the icon. |
| "Turn on reminders" does nothing                 | You're on iOS below 16.4, or in a Safari tab rather than the installed app.     |
| Notifications say "blocked"                      | iPhone **Settings → Notifications → Family Hub**, allow them, then reopen.      |
| `curl` returns 401                               | The secret in the `curl` command doesn't match the one in `app_config` (7c–7e). |
| `curl` returns `sent: 0, skipped: 2`             | Working as intended — already sent today. `delete from public.push_sends;` to re-test. |
| Nothing arrives but `sent` is above 0            | The push reached Apple. Check the phone isn't in Do Not Disturb or Focus mode.  |
| Reminders stopped after a while                  | If you regenerated the VAPID keys, every phone must tap "Turn on reminders" again. |
| Home looks out of date                           | It refreshes when you reopen the app, or switch tabs and back.                 |
| Memos/Groceries show a red **Not live** dot      | The realtime socket isn't connected — see *Live updates* below.               |
| Changes appear only after a refresh              | Same as above.                                                               |
| Cleared items reappear on the other phone        | Step 3 — re-run the schema script (it sets `REPLICA IDENTITY FULL`).           |
| "Export to calendar" errors, or the link 404s     | Step 3 — re-run the schema script; the feed needs `calendar_token`.            |
| iPhone won't subscribe to the calendar link       | Use the `https://…` link, not `webcal://`, when pasting manually. Check the URL ends in `.ics`. |
| Subscribed calendar is missing recent events      | Normal — iOS refreshes on its own schedule. See *Subscribing to the calendar*.  |

---

## Step 7 — Turn on notifications (optional)

Skip this and everything else still works; the app just won't buzz your phone.
Budget about 15 minutes.

### 7a. Generate the VAPID keys

"VAPID" is the keypair that proves a notification really came from your app.
Apple and Google both refuse push without it.

On your computer, in the project folder:

```bash
node scripts/generate-vapid-keys.mjs
```

It prints two long strings and writes nothing to disk — that's deliberate, the
private key must never end up in the repo.

> Run this **once**. If you generate new keys later, every phone's subscription
> stops working and everyone has to tap "Turn on reminders" again.

### 7b. Put the keys in Vercel

**Project Settings → Environment Variables**, add three:

| Name                          | Value                                            |
| ----------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`| the public key from the script                   |
| `VAPID_PRIVATE_KEY`           | the private key from the script — **secret**     |
| `VAPID_SUBJECT`               | `mailto:your@email.com`                          |

Then **Deployments → ⋯ → Redeploy**. The "Reminders" card only appears on the
Home screen once these exist.

> `VAPID_SUBJECT` is just a contact address, so a push service can reach you if
> your notifications start misbehaving. Any email of yours is fine.

### 7c. Make a scheduler secret

The nightly job needs a password to prove it's really your scheduler. Generate
one:

```bash
openssl rand -hex 32
```

Copy the result. It goes in **two** places, both below. Nothing else needs it —
in particular it does *not* go in Vercel.

### 7d. Tell the database the secret

Supabase → **SQL Editor** → **New query**. Paste this, replacing
`PASTE_YOUR_SECRET_HERE`:

```sql
insert into public.app_config (key, value)
values ('push_cron_secret', 'PASTE_YOUR_SECRET_HERE')
on conflict (key) do update set value = excluded.value;
```

Run it.

### 7e. Schedule the nightly job

Still in the SQL Editor. Replace **both** placeholders — your Vercel URL and the
same secret — then run:

```sql
-- One-time: let Postgres run schedules and make outbound web requests.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous version of this job before re-adding it.
select cron.unschedule('family-hub-reminders')
where exists (select 1 from cron.job where jobname = 'family-hub-reminders');

select cron.schedule(
  'family-hub-reminders',
  -- Minute and hour, in UTC. '0 0 * * *' is midnight UTC = 9am in Seoul.
  -- Pick the UTC hour that lands mid-morning where your family lives.
  '0 0 * * *',
  $$
  select net.http_post(
    url    := 'https://YOUR-APP.vercel.app/api/push/run',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer PASTE_YOUR_SECRET_HERE'
    )
  );
  $$
);
```

> **Choosing the hour.** Reminders are worked out in UTC, so pick the UTC hour
> that is morning for you and leave it. Some conversions: Seoul 9am = `0`,
> London 9am = `8` (`9` in winter), New York 9am = `13` (`14` in winter).

To check the job exists: `select jobname, schedule from cron.job;`

### 7f. ⚠️ Add the app to each Home Screen — required on iPhone

**On an iPhone, web notifications only work for an app added to the Home
Screen.** In a normal Safari tab, iOS doesn't offer them at all. This is Apple's
rule, not something I can work around.

So on **every** iPhone that wants reminders:

1. Open your Vercel URL in **Safari**.
2. **Share** → **Add to Home Screen** → **Add**.
3. **Open Family Hub from the new icon** — not from Safari.
4. On the Home screen, find **Reminders** → **Turn on reminders**.
5. Tap **Allow** when iOS asks.

It should then say *"Reminders are on for this device."* Repeat on the second
phone — this is per-device, not per-person.

You also need **iOS 16.4 or later**. If you open the app in a Safari tab
instead, the card will tell you to install it first rather than showing a button
that can't work.

### 7g. Test it without waiting for tomorrow

Trigger the job by hand from your computer, using your URL and secret:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/push/run \
  -H "Authorization: Bearer PASTE_YOUR_SECRET_HERE"
```

It replies with a summary like
`{"ok":true,"families":1,"sent":2,"skipped":0,"failed":0,"pruned":0}`.

- `sent` counts notifications that reached a device.
- `skipped` means "already sent today" — that's the duplicate guard working.
- If `sent` is 0 and `skipped` is 0, nothing was due. Add a grocery item, or a
  date whose reminder lands today, and try again.

**A notification only goes out once.** To re-test the same one, clear the record:

```sql
delete from public.push_sends;
```

---

## What triggers a notification

| Notification    | When                                                                 |
| --------------- | -------------------------------------------------------------------- |
| Anniversary     | Exactly on its "remind me X days before" day, and again on the day itself. |
| Shopping list   | Once a day, only while something is unchecked.                        |

Anniversaries fire **twice per year at most** — on the lead day and the day
itself — rather than every morning of the window. Nothing fires when there's
nothing to say.

---

## Subscribing to the calendar on an iPhone

On the **Schedule** tab, scroll to **Export to calendar**.

**On the phone you're holding:**

1. Tap **Subscribe on this device**.
2. iOS shows a "Subscribe to Calendar" sheet — tap **Subscribe**, then **Done**.
3. The events appear in the built-in Calendar app and refresh on their own.

**For someone else's phone (e.g. your partner's):**

1. Tap **Copy link for another device**.
2. Send them the link.
3. On their iPhone: **Settings → Calendar → Accounts → Add Account → Other →
   Add Subscribed Calendar**, paste the link, tap **Next**, then **Save**.
   (Tapping the link in Safari also works and is quicker.)

**On Google Calendar:** *Other calendars → + → From URL*, paste the link.

### Two things worth knowing

- **Treat the link like a password.** Anyone who has it can read your family's
  calendar. That's unavoidable for calendar subscriptions — the calendar app
  can't log in, so the link itself is the key. It's read-only and exposes
  nothing but events: no memos, no groceries, no way to change anything.
  If a link gets out, tap **Create a new link** to revoke it.
- **iOS decides how often to refresh**, typically every few hours — not
  instantly. Inside Family Hub itself changes appear immediately; it's only the
  subscribed copy in Apple's Calendar that lags. You can force it in Calendar
  with a pull-to-refresh, or set **Settings → Calendar → Accounts →
  Subscribed Calendars → Fetch New Data**.

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
