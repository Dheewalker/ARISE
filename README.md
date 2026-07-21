# ARISE — Programme Knowledge Base

Real deployment version: Supabase (Postgres + real authentication) + React, built for Netlify.

This replaces the artifact preview's `window.storage` (which only works inside Claude's preview) with a real backend — real user accounts, real database, real row-level security. What worked in the preview is functionally the same here, just backed by infrastructure that works from any browser, not just Claude's.

## What changed from the artifact version

- **Login is now real Supabase Auth** (email + password), not a custom PIN hash. Passwords are hashed server-side by Supabase; sessions are real JWTs.
- **Admin access is granted server-side.** The admin code is checked inside a Postgres function (`claim_admin`) — the client never sees or can spoof it.
- **Data lives in Postgres**, not client-side storage, with row-level security policies enforcing who can read/write what (e.g., only venture members can read that venture's chat; only the sender/recipient can read a DM; admins can read all DMs for moderation, same as the artifact version disclosed).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up (free tier is enough for a cohort-sized programme) → "New Project"
2. Once created, go to **SQL Editor** → New Query → paste the entire contents of `schema.sql` from this project → **Run**
   - This creates all tables, security policies, the admin-claim function, and seeds the 14 curriculum sheets
3. Go to **Project Settings → API** → copy your **Project URL** and **anon public key**

## 2. (Optional but recommended) Auth settings

Go to **Authentication → Providers → Email**. By default, Supabase requires email confirmation before sign-in works.

- For a real cohort: leave email confirmation **on** — participants confirm via a real email link.
- For quick testing: you can turn confirmation **off** temporarily under **Authentication → Settings**, so accounts work immediately after signup.

## 3. Local setup

```bash
npm install
cp .env.example .env
# edit .env and paste in your Supabase URL + anon key
npm run dev
```

Visit the local URL it prints, create an account, and confirm the app works end-to-end before deploying.

## 4. Deploy to Netlify

1. Push this project to a new GitHub repository
2. Go to [netlify.com](https://netlify.com) → "Add new site" → "Import an existing project" → connect GitHub → select the repo
3. Build settings should auto-detect from `netlify.toml` (`npm run build`, publish directory `dist`) — confirm and continue
4. Before deploying, go to **Site settings → Environment variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon public key
5. Trigger a deploy. You'll get a live URL like `arise-explore.netlify.app`

## 5. Becoming an admin

During signup, enter the admin code `ARISE-ADMIN-2026` in the "Admin code" field. This calls a server-side function that verifies the code before flipping `is_admin` — change this code in `schema.sql`'s `claim_admin` function before real use, and re-run just that function definition in the SQL Editor if you update it later.

## What's still worth adding before a full cohort launch

- **Real-time updates**: messages and venture chat currently require a manual reload/re-open to see new messages from others. Supabase supports realtime subscriptions — a reasonable next iteration.
- **Email templates**: Supabase's default confirmation/reset emails are plain; customizable under Authentication → Email Templates.
- **Custom domain**: Netlify supports adding your own domain (e.g. `arise.sutd.edu.sg`) under Site settings → Domain management.
- **Rate limiting / abuse protection**: fine for a closed cohort of ~30 people; add stricter Supabase policies if this is ever opened more broadly.
