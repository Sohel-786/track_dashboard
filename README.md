# TrackDash

Personal progress tracker built as a single Next.js app (UI + API).

## Features

- Username/password login (HttpOnly JWT cookie, **30-day** session)
- Seeded admin: `sohel` / `1036425`
- Admin can create users
- Category master (name + target ≥ 1), user-scoped
- Daily entries per category
- Dashboard KPIs (today / week / month / year / custom) + progressive charts
- Installable PWA

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

## Deploy on Vercel (required)

Local `.env.local` is **not** uploaded to Vercel. You must add the same variables in the Vercel project or login will return 500 / “Unable to login”.

### 1. Environment variables

In **Vercel → Project → Settings → Environment Variables**, add for **Production**, **Preview**, and **Development**:

| Name | Value | Notes |
|------|--------|--------|
| `MONGODB_URI` | Atlas connection string | Must be reachable from the internet — **not** `localhost` |
| `AUTH_SECRET` | 32+ random chars | Same generator command as above |

MongoDB Atlas: allow network access from Vercel (e.g. `0.0.0.0/0` for Hobby) and use a database user with read/write on your DB.

### 2. Redeploy

After saving env vars, go to **Deployments → … → Redeploy** (or push a new commit). New env values apply only after a redeploy.

### 3. Verify

1. Open your `*.vercel.app` URL → login page loads.
2. Sign in with the seeded admin (`sohel` / `1036425`) unless you changed it.
3. On phone: open the site in the browser first; if you previously installed a broken PWA, remove it and re-add after a successful load.

Production builds fail fast if `AUTH_SECRET` or `MONGODB_URI` are missing so a broken deploy is not shipped silently.
