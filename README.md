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
- **Journey map**: live tracking, distance travelled, every place you stopped,
  and a masjid log with how long each visit lasted — built entirely on free,
  keyless OpenStreetMap services
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

The job at `/api/notifications/run` is safe to call as often as you like — it is
idempotent and rate-limited per slot. It does two things on each tick: send any
due prayer reminders, and work off the map's backlog of unnamed stops (plus
prune anything past a user's retention window). Deployments with no VAPID
keypair get `"pushConfigured": false` in the response and still run the map
upkeep.

**Vercel's Hobby plan only runs crons once a day**, and it rejects any tighter
schedule *at deploy time* — a `*/15 * * * *` entry in `vercel.json` fails the
build outright. So `vercel.json` registers no cron at all; the job is driven
from outside instead. Point any external scheduler (cron-job.org, GitHub
Actions, an always-on box) at:

```
https://<your-app>/api/notifications/run?key=<CRON_SECRET>
```

every 10–15 minutes. The secret is also accepted as an `x-cron-secret` header
or an `Authorization: Bearer` token (which is what Vercel Cron sends), and is
compared in constant time.


## Journey map

**/map** answers where you went, how far you travelled, and how long you stayed
— and joins that to the prayer checklist, so a masjid visit can show which
prayers were offered inside it.

It is **off until you turn it on**, per account, from **Map → Live** or
**Map → Settings**. Nothing about anyone's movements is recorded before that,
and the switch belongs to the account holder — an admin cannot enable it for
someone else.

### There is nothing to sign up for

Every piece of the map is free and keyless. No Google Maps account, no Mapbox
token, no billing:

| What | Source | Cost |
|------|--------|------|
| Map tiles | OpenStreetMap, CARTO light/dark | Free, no key |
| Masjid search | Overpass API (`amenity=place_of_worship` + `religion=muslim`, plus `building=mosque`) | Free, no key |
| Place names | Nominatim reverse geocoding | Free, no key |
| Distance, Qibla, stay detection | Computed in this app | — |

The only optional variable is `MAP_CONTACT` — see `.env.example`. OSM's usage
policy asks a self-hosted app to identify itself so its operators can reach you
before rate-limiting; set it to an email or URL and it is sent in the
`User-Agent`. Nothing breaks if you leave it unset.

**The browser never talks to OpenStreetMap's APIs.** Overpass and Nominatim are
called from the server, cached in MongoDB (including negative results) and
throttled to one request per second, which is what their policies ask for. That
also means the app's CSP keeps `connect-src 'self'` — the only third-party
origins that exist at all are the three tile hosts, reached as images.

### The tabs

- **Live** — the switch, your position on the map with an accuracy halo,
  today's route drawn as you walk it, session distance, a Qibla compass read
  from wherever you are, and a "masjids near me" lookup.
- **Journeys** — pick a range: total distance, time moving, distance per day,
  which hours you are actually out, and a day picker that redraws any day's
  route with its stops and the trips between them. Exports to GPX, GeoJSON or
  CSV, built in the browser.
- **Masjids** — every masjid you visited, how many times, total / average /
  longest stay, days visited, and a per-visit table: date, arrived, left, how
  long you stayed, and which prayers are logged for that window.
- **Places** — the same for everywhere else, plus **Correct a stop**: rename a
  stay, mark one as a masjid, or drop it. OpenStreetMap does not have every
  jamaat khana, so you always get the last word.
- **Settings** — detection thresholds, retention, and one button that erases
  every fix and stop this account holds.

### How a stop becomes a visit

1. The browser reports positions while the page is open. A fix is stored when
   you have moved more than 15 m, or every 90 s while you have not — the
   heartbeat is what gives a stay its duration. Fixes accurate to worse than
   120 m are discarded.
2. Fixes are queued in `localStorage` and flushed every 30 s, on going offline,
   and when the page is hidden — so a tunnel does not lose the walk.
3. The server re-derives that day's **stays** from its raw fixes. A stay is a run
   of fixes that stayed within the **stay radius** of both its own centre *and*
   its first fix, for at least the **minimum stay**. Both tests matter: without
   the second, a slow walk past the shops registers as standing outside them,
   because every point on a 160 m line sits within 80 m of that line's midpoint.
4. Each stay is then named. Masjids are asked about first — a stay inside the
   **masjid radius** of a mapped masjid becomes a visit to it. Everything else
   goes to the general geocoder.
5. A masjid visit is joined to your prayer log by **window overlap**: if the
   visit covered the Magrib window and Magrib is marked as prayed, it is listed
   as Magrib at that masjid. It reflects what you recorded, never a guess.

Naming costs a rate-limited OSM round trip, so it never blocks anything: stops
show as "Looking up…" and fill in behind the UI, and the 15-minute reminder job
works off any backlog.

### What it cannot do

**A website cannot read your location in the background.** That is a platform
rule on both iOS and Android, not a setting — positions arrive only while the
TrackDash tab or installed app is open. So open the Map before you set off and
leave it open for the walk. The app keeps a screen wake lock while recording
where the browser allows it, and says plainly when it is not recording rather
than quietly losing the journey.

### Privacy

Location history is the most sensitive thing TrackDash stores, and it is treated
that way:

- off by default, opt-in per account, and the write path re-checks consent so a
  tab left open after you switch off cannot keep recording;
- every query is scoped by `userId`, like the rest of the app;
- coordinates go to no advertising or analytics service — only to OSM's public
  geocoders, from the server, to turn a coordinate into a place name;
- **Settings → Erase location history** deletes every fix and stop immediately;
- an optional retention window (30 days to a year) prunes old fixes on its own.

Prayer records are never touched by any of this.

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
| Map tiles | The only third-party origins in the CSP, allowed under `img-src` alone. `script-src` stays `'self'` — Leaflet is bundled, not loaded from a CDN — and `connect-src` stays `'self'`, because OSM's APIs are called server-side |
| Location | `Permissions-Policy: geolocation=(self)`; recording is opt-in per account and the ingest endpoint refuses fixes when that account has tracking off |
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
