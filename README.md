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

TrackDash sends two different kinds of notification, and only the second one is
on a timer:

| When | What arrives |
|------|--------------|
| The moment a prayer's window opens | **It's Asar time** — 5:10 pm – 6:57 pm · mark it once you've prayed |
| Every interval after that, while it is still unmarked | **Asar still unmarked** — Until 6:57 pm · 1h 16m left |
| Once under 30 minutes remain | **Asar ends soon** — Until 6:57 pm · 16m left |

**The interval never delays the first notification.** Picking 30m / 1h / 2h
(default 1h) sets the gap between *repeats* — so on 30m, Asar starting at 5:10
announces itself at 5:10 and nudges again at 5:40, 6:10, and so on. Everything
stops the moment the prayer is marked or the window closes.

A start announcement only fires while the window genuinely just opened (within
about 12 minutes). If the scheduler was down and comes back mid-afternoon, the
first notification is phrased as a reminder rather than announcing a prayer time
that passed an hour ago.

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

### Scheduling the job — reminders do not work without this

**Nothing in the app watches the clock.** Prayer times are only noticed when
something outside calls `/api/notifications/run`, and if nothing does, the
feature is silently dead: the toggle still says on, the browser permission is
still granted, and the **test button still works** — because a test is sent
directly and never goes near the job. That combination is the single most likely
reason reminders "just don't arrive". The reminders card on **/namaz** says so
outright when the job has not been called in the last 45 minutes.

The job is safe to call as often as you like — it is idempotent and claims each
slot atomically, so overlapping calls cannot double-send. **Call it once a
minute.** That is what makes a prayer announce itself at 5:10 rather than at
whenever the next coarse tick happens to land. A tick with nothing due is a
couple of indexed reads; the map upkeep it also drives (naming stops, pruning
past the retention window) paces itself to once every 15 minutes so the free
OpenStreetMap services are not hammered.

**Vercel's Hobby plan only runs crons once a day**, and it rejects any tighter
schedule *at deploy time* — a `*/15 * * * *` entry in `vercel.json` fails the
build outright. So `vercel.json` registers no cron at all and the job is driven
from outside. Two free ways to do that:

**1. cron-job.org — recommended, one minute, no repo involved.**
Sign up (free), create a job, and point it at:

```
https://<your-app>/api/notifications/run
```

Set the schedule to **every 1 minute**, and add a request header
`x-cron-secret: <CRON_SECRET>`. Prefer the header: a `?key=` query string works
too, but it ends up in logs and proxy history, and that value is a password.

**2. GitHub Actions — already committed, nothing to sign up for.**
`.github/workflows/namaz-reminders.yml` runs the job every 5 minutes. Under
**Settings → Secrets and variables → Actions**, add one of each:

| Tab | Name | Value |
|-----|------|-------|
| **Variables** | `APP_URL` | `https://your-app.vercel.app` — the site **root**. No path, no trailing slash. |
| **Secrets** | `CRON_SECRET` | the same value as the `CRON_SECRET` env var on the host |

`APP_URL` goes in **Variables**, not Secrets: Actions masks every secret value in
log output, so an `APP_URL` stored as a secret prints as `***` and hides the one
detail worth seeing when a call goes wrong. A public site's address is not a
password. (The workflow accepts it as a secret too, if you already made one.)

Then open the **Actions** tab and run *Namaz reminders* once by hand to confirm
the wiring. The log prints the URL it called, the HTTP status, and the JSON the
job returned — and fails loudly, with the reason named, on a redirect, a
mismatched secret, or an HTML page coming back where JSON was expected. Two caveats: five minutes is GitHub's floor and scheduled runs are
queued at low priority, so a tick can land 5–20 minutes late — a start
announcement may miss its grace window on a bad day. And scheduled workflows are
switched off automatically after 60 days without a commit. It is a good backstop
and a poor sole scheduler; running both at once is fine.

Whatever calls it, the secret is accepted as an `x-cron-secret` header, an
`Authorization: Bearer` token, or a `?key=` query string, and is compared in
constant time.

#### Checking it is actually running

```bash
curl -s -H "x-cron-secret: $CRON_SECRET"   https://<your-app>/api/notifications/run | jq
```

`checkedUsers` is how many accounts have a device registered, `openSlot` is the
prayer whose window is open right now (null between sunrise and Zohar),
`startPings` counts "it's prayer time" announcements sent on that tick, and
`track` is null on the ticks between map passes — which is expected, not a
failure.


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

### If location will not turn on

The Live tab names the actual cause and gives the fix for your platform. The
three it distinguishes, because they need completely different answers:

| What you see | What is wrong | What fixes it |
| --- | --- | --- |
| **This page is not served over HTTPS** | Browsers refuse geolocation on an insecure origin. A phone opening `http://192.168.x.x:3002` hits this every time, and is never even prompted. | Use `https://`, or `http://localhost` on the same machine. To test on a phone against the dev server, run `npm run dev:https` and open the `https://` address it prints (accept the self-signed certificate warning once). |
| **Location is blocked for this site** | The site permission was refused. | Allow it in the address-bar site settings. The page notices the change and re-arms itself — no reload needed. |
| **Your device could not work out where it is** | The site is allowed, but the OS location service is off, or there is no GPS lock. | Turn on location in the system settings. Note that a desktop or laptop has no GPS chip: it positions by Wi-Fi and is often only accurate to hundreds of metres, which is too rough to record a journey. The Live tab says so rather than silently dropping every fix. |

**Locate me** works without turning tracking on — reading where you are and
recording where you go are separate things, and only the second one needs
consent.

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

> Push notifications and geolocation both need a secure context. `localhost`
> counts as secure, so they can be tested on this machine without HTTPS.

To test either of them **on a phone** against the dev server, plain
`http://<LAN-IP>:3002` will not do — it is not a secure origin, so the browser
refuses the location request outright. Run the HTTPS dev server instead:

```bash
npm run dev:https
```

It listens on every interface with a self-signed certificate; open the
`https://<LAN-IP>:3002` address on the phone and accept the warning once.

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
