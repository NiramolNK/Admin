# NiRM Roster — Deployment Guide

Total time: ~45–60 minutes. Cost: $0/month for a team of 30.

## What you're deploying

- **Frontend**: Your existing `AllocationRoster2026.jsx` plus a thin auth wrapper. Hosted on Vercel.
- **Backend**: Supabase. One Postgres table stores the entire app state as JSON. Supabase Auth handles sign-in. Realtime broadcasts changes so everyone's view stays in sync.

No code servers to run. No infrastructure to babysit.

---

## Step 1 — Create Supabase project (10 min)

1. Go to https://supabase.com and sign up (Google login works).
2. Click **New project**.
   - **Name**: `nirm-roster` (or whatever you like)
   - **Database password**: generate one and save it somewhere (you won't need it often)
   - **Region**: pick **Singapore** (closest to Thailand)
3. Wait ~2 minutes for the project to provision.
4. Once ready, in the left sidebar click **SQL Editor → New query**.
5. Paste the entire contents of `supabase-schema.sql` and click **Run**. You should see "Success. No rows returned."
6. In the left sidebar click **Project Settings → API**. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

That's it for Supabase. The database is ready, auth is enabled by default.

---

## Step 2 — Get the code running locally (10 min)

1. Make sure you have **Node.js 18+** installed (`node --version`).
2. Put all these files into a folder called `nirm-roster`:

   ```
   nirm-roster/
   ├── index.html
   ├── package.json
   ├── vite.config.js
   ├── .env.example
   ├── .gitignore
   └── src/
       ├── main.jsx
       ├── App.jsx
       ├── supabase.js
       └── AllocationRoster2026.jsx
   ```

   Note: `main.jsx`, `App.jsx`, `supabase.js`, and `AllocationRoster2026.jsx` go in a `src/` subfolder; the rest go at the project root.

3. Create `.env.local` (copy from `.env.example`) and paste your Supabase values:

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key-here
   ```

4. Install and run:

   ```bash
   cd nirm-roster
   npm install
   npm run dev
   ```

5. Open http://localhost:5173. You should see the sign-up screen.

6. **Create your first account** — use your real email. The first account becomes **manager** automatically.
7. Check your email for the Supabase confirmation link, click it, then come back and sign in.

If everything works locally, you're 90% done.

---

## Step 3 — Deploy to Vercel (10 min)

1. Create a GitHub repo and push your code:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a private repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/nirm-roster.git
   git branch -M main
   git push -u origin main
   ```

2. Go to https://vercel.com and sign up with GitHub.
3. Click **Add New → Project**, import your `nirm-roster` repo.
4. Vercel auto-detects Vite. Before clicking Deploy, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**. Wait ~1 minute.
6. You get a URL like `nirm-roster.vercel.app`. Share it with your team.

Every `git push` to `main` auto-deploys.

---

## Step 4 — Add your team (5 min)

1. Each team member visits the URL and clicks **First time? Create one**.
2. They enter their email, a password, and a username (you'll want a naming convention — match their existing usernames in the code: `Markhom`, `Prim`, `Vee`, `Ton`, etc.).
3. They confirm via email and sign in. They start as **viewer**.
4. You (as manager) go to the **Users** panel in the sidebar and promote them to **fulltime** or keep them as **viewer**.

For the existing agents already in the code (`Markhom`, `Veer`, etc.), if you want them to log in as themselves, have them sign up with their agent name as the username. The existing `myAgent` logic matches by `name.toLowerCase()` so it'll find the right roster row automatically.

---

## What you get

- **One shared roster** — when Prim updates a CS assignment, Vee sees it in real time. No more "which version is current?"
- **Role-based access** — viewers see only their own roster, fulltime users can edit, managers can do everything.
- **Real email/password auth** — Supabase handles password reset, email confirmation, brute-force protection.
- **Auto-backup** — Supabase's free tier includes 7 days of point-in-time recovery.
- **Audit trail** — the `updated_by` column in `app_state` records which email last touched the data.

## What you don't get yet

- **Granular permissions per field** — fulltime users can edit *everything* in app_state. If you want fulltime to only edit their own brand's roster, you'd add per-key RLS policies (achievable but a bigger task).
- **Concurrent-edit detection** — last-write-wins still applies. With 250ms debounce + Realtime push, the window for genuine conflicts is tiny (~half a second), and the visible-team-size is small enough that it won't be a practical issue.
- **Mobile-optimized UI** — the original component is desktop-first. Works on tablets, cramped on phones.

## Cost

- **Vercel free tier**: unlimited static sites, 100 GB bandwidth/month. Your traffic will be a tiny fraction of that.
- **Supabase free tier**: 500 MB database, 2 GB bandwidth, 50K monthly active users, 7-day backups. Your data will be well under 1 MB even after a year.
- **Real cost**: $0/month until you hit either limit. If you ever do, both have a $25/month next tier that's overkill for your scale.

## Troubleshooting

**"Missing Supabase env vars"** — `.env.local` wasn't picked up. Make sure you used the `VITE_` prefix and restart `npm run dev`.

**"Auth session missing"** after signing in — clear the cookies/local storage for the dev URL and try again. This usually means a stale session from a previous Supabase project.

**Realtime doesn't fire when another browser updates** — verify Step 5 of the SQL ran. In Supabase Dashboard → Database → Replication, make sure `app_state` is enabled.

**Sign-up email never arrives** — check spam, then in Supabase Dashboard → Authentication → Email Templates verify the SMTP settings (free tier uses Supabase's shared SMTP which is sometimes flaky). For production you'd plug in your own SMTP (Resend, SendGrid, etc.) but it's fine for getting started.

**"Permission denied for table app_state"** — your profile row is missing or has the wrong role. Go to Supabase Dashboard → Table Editor → profiles and check that your user has a row with `role = 'manager'`.
