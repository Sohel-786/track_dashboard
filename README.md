# TrackDash

Personal progress tracker built as a single Next.js app (UI + API).

The app opens on **/namaz** — the prayer checklist is the screen with something
to do on it. Entry analytics live at **/dashboard**.

## Features

- Username/password login (HttpOnly JWT cookie, **30-day** session)
- Seeded admin: `sohel` / `1036425` (override before deploying — see below)
- Admin can create users
- Category master (name + target ≥ 1), user-scoped
- Daily entries per category
- Namaz: today's checklist, Kaza make-ups, insights
- **Push reminders** while a prayer is still unmarked inside its window
- Installable PWA

## Namaz push reminders

While a prayer's window is open and the prayer is not yet marked, TrackDash
sends a Web Push notification — it lands in the phone's notification shade like
any other app. It repeats on the chosen interval (30m / 1h / 2h, default 1h)
and stops the moment the prayer is marked or the window closes.

The notification carries a **Mark prayed** button that writes the entry straight
from the service worker, without opening the app.

### Where the four values come from

**There is no VAPID account and nothing to sign up for.** VAPID is just a
keypair you generate on your own machine; the push services (Google, Mozilla,
Apple) verify the signature and never ask who you are. So there is no portal,
no dashboard and no login for any of this.

#### 1. `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`

Run this once, anywhere — it needs no network and creates no account:

```bash
npx web-push generate-vapid-keys
```

It prints something like:

```
Public Key:
BPyjIDKCmW4aJXVky_uhDEB5QsK94Ea5nMnrb9BusCAw44iK_GbfcaMlxLOqVHTX_d654xzL1rjpcymKBzEGCMg

Private Key:
9MoIYY...
```

- The **public** key is handed to the browser when a device turns reminders on.
  It is what tells that browser "only the server holding the matching private
  key may push to me".
- The **private** key stays on the server and signs every push. Treat it like a
  password: never commit it, never expose it to the browser.
- They are a matched pair — **regenerating them invalidates every device that
  already subscribed**, and each one has to toggle reminders off and on again.
  Generate once and keep them.

`.env.local` already holds a working pair for local development. Generate a
**separate** pair for production rather than reusing the local one.

#### 2. `VAPID_SUBJECT`

Not a login — just a contact URI the push services use to reach the operator if
a server starts sending abusive or broken pushes. It must be a `mailto:` URI or
an `https://` URL:

```env
VAPID_SUBJECT=mailto:ss1036425@gmail.com
```

That is the only place an email appears anywhere in the app.

#### 3. `CRON_SECRET`

A random string you invent. It is the password on `/api/notifications/run`, so
the internet cannot trigger a notification flood. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use a **different** value in production from the local one.

#### 4. Put them in the environment

Locally they go in `.env.local` (already done). For production, in
**Vercel → Project → Settings → Environment Variables**, add all four for
Production, Preview and Development, then **Redeploy** — new env values only
apply after a redeploy.

```env
VAPID_PUBLIC_KEY=<public key from step 1>
VAPID_PRIVATE_KEY=<private key from step 1>
VAPID_SUBJECT=mailto:ss1036425@gmail.com
CRON_SECRET=<random string from step 3>
```

Without these the feature stays hidden: the reminder toggle is simply not
rendered and nothing else changes.

#### 5. Turn it on per device

Open **/namaz** and flip **Prayer reminders**. The browser asks for permission
once; allow it. Each phone, tablet and desktop registers separately, so do this
on every device you want nudged. The send button next to the toggle fires a
test notification so you can confirm delivery straight away.

> On iOS, Web Push only works once the site is **added to the Home Screen** and
> opened as an app. That is an Apple platform restriction, not an app setting.

### Scheduling the job

The reminder job lives at `/api/notifications/run` and is safe to call as often
as you like — it is idempotent and rate-limited per slot.

`vercel.json` registers a Vercel Cron every 15 minutes. **Vercel's Hobby plan
only runs crons once a day**, so on Hobby use any external scheduler
(cron-job.org, GitHub Actions, an always-on box) pointed at:

```
https://<your-app>/api/notifications/run?key=<CRON_SECRET>
```

every 10–15 minutes. The secret is also accepted as an `x-cron-secret` header
or an `Authorization: Bearer` token (which is what Vercel Cron sends), and is
compared in constant time.

## Security

| Area | What is in place |
|------|------------------|
| Passwords | bcrypt, cost 12; minimum 8 characters on create/change |
| Sessions | HttpOnly + SameSite=Lax cookie, `Secure` in production, HS256 JWT pinned to that algorithm |
| Session revocation | Every account carries a `sessionVersion`. Changing a password, role or active flag bumps it, so existing 30-day tokens stop working immediately |
| Account state | Each authenticated request re-checks that the account still exists and is active (30s cache) — deactivating a user takes effect at once |
| Brute force | Per-IP (20 / 10 min) and per-username (5 / 15 min) sliding-window limits on login, with lockout and a `Retry-After` |
| User enumeration | "Invalid credentials" for both unknown user and wrong password |
| CSRF | SameSite cookie plus a Fetch-Metadata/Origin check in middleware that rejects every cross-site `POST`/`PUT`/`PATCH`/`DELETE` |
| Header spoofing | `x-user-*` headers are stripped from incoming requests before middleware sets them from the verified session |
| Injection | Every request body and query parameter is parsed with Zod; ids are validated as ObjectIds before reaching a query |
| SSRF | Push endpoints must be public HTTPS hosts — loopback, private ranges, `.local`/`.internal` and cloud metadata addresses are rejected |
| Authorisation | Every collection is scoped by `userId` in the query itself; admin-only routes go through `requireAdmin` |
| Headers | CSP (no third-party script/frame/connect), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By` |
| Caching | `/api/*` responses are `no-store`, and the service worker never caches API traffic |
| Cron | `/api/notifications/run` requires a shared secret, compared in constant time, and is rate-limited |

### Before exposing an instance publicly

The seeded admin password is documented above, so set your own **before first
run**:

```env
SEED_ADMIN_USERNAME=youradmin
SEED_ADMIN_PASSWORD=<long random password>
SEED_ADMIN_NAME=Your Name
```

If the account already exists, change its password from **Users** instead —
that bumps `sessionVersion` and signs out every existing session.

## Tracking start (why a new account has no backlog)

Every account has a **first tracked day**. Nothing before it is ever counted as
a missed prayer, charted as an empty day, or accepted as an entry — there is no
such thing as a day you failed to record before you started.

It resolves in this order (strongest first):

1. the account's own `trackingStartDate`, when an admin sets one in
   **Users → Tracking from**;
2. otherwise **the day the account was created** — the default, so a brand-new
   user always starts clean;
3. raised (never lowered) by the optional deployment-wide floor
   `NEXT_PUBLIC_TRACKING_START_DATE`.

The floor is optional and usually unnecessary. Set it only to hard-stop a whole
deployment from counting anything before a go-live date; on Vercel it must be
added to the project env and redeployed, whereas the per-user date is editable
from the UI at any time.

## Setup (local)

1. Copy `.env.example` to `.env.local` and set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/track_dashboard
AUTH_SECRET=your-long-random-secret
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Start MongoDB locally (or point `MONGODB_URI` at Atlas).

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) and sign in.

> Push notifications need a secure context. `localhost` counts as secure, so
> reminders can be tested locally without HTTPS.

## Deploy on Vercel (required)

Local `.env.local` is **not** uploaded to Vercel. You must add the same variables in the Vercel project or login will return 500 / “Unable to login”.

### 1. Environment variables

In **Vercel → Project → Settings → Environment Variables**, add for **Production**, **Preview**, and **Development**:

| Name | Value | Notes |
|------|--------|--------|
| `MONGODB_URI` | Atlas connection string | Must be reachable from the internet — **not** `localhost` |
| `AUTH_SECRET` | 32+ random chars | Same generator command as above |
| `VAPID_PUBLIC_KEY` | from `web-push generate-vapid-keys` | Optional — omit to disable push |
| `VAPID_PRIVATE_KEY` | from the same command | Keep secret |
| `VAPID_SUBJECT` | `mailto:ss1036425@gmail.com` | Contact URI, not a login |
| `CRON_SECRET` | 32+ random chars | Guards the reminder job |
| `SEED_ADMIN_PASSWORD` | your own admin password | Set before the first deploy |

MongoDB Atlas: allow network access from Vercel (e.g. `0.0.0.0/0` for Hobby) and use a database user with read/write on your DB.

### 2. Redeploy

After saving env vars, go to **Deployments → … → Redeploy** (or push a new commit). New env values apply only after a redeploy.

### 3. Verify

1. Open your `*.vercel.app` URL → login page loads.
2. Sign in; you land on **Namaz**.
3. On phone: install to the Home Screen, open it, turn on **Prayer reminders**,
   and press the send button to confirm a notification arrives.
4. Hit `/api/notifications/run?key=<CRON_SECRET>` once — it should return a JSON
   summary rather than 401.

Production builds fail fast if `AUTH_SECRET` or `MONGODB_URI` are missing so a broken deploy is not shipped silently.
