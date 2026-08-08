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

## Setup

1. Copy `.env.example` to `.env.local` and set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/track_dashboard
AUTH_SECRET=your-long-random-secret
```

2. Start MongoDB locally (or point `MONGODB_URI` at Atlas).

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.
