# HANDOFF — Anti-bot / anti-scraping for NiRM (and a reusable pattern for other CREA apps)

Written 19 Oct 2026. Self-contained: a fresh session (or another project) can continue from this file alone.

## Goal
Stop outsiders from using bots against NiRM (nirmroster.vercel.app): no automated account creation, no password-guessing on the login, no bulk download ("scraping") of roster / payroll / customer data, and limit what can be taken from the code. Owner: April (niramol.k@crea.asia). Managers in NiRM = April and Prim.

## The stack (so the pattern transfers)
React/Vite SPA on Vercel → Supabase (project `bequrilwgooesolepubv`): Postgres with RLS, Auth (email+password only, all accounts @crea.asia), Storage bucket `payroll-docs`, Edge Functions. The Supabase **anon key ships inside the JS bundle** — this is normal, and it means the database API, not the UI, is what a bot would talk to. Any app built the same way (DONE / WorkOS, Duoke MCP, etc.) has the same shape and the same fixes apply.

## Threat model — what a bot can and cannot reach (audited 19 Oct)
| Surface | Without login | With any login |
|---|---|---|
| Postgres tables (40 in `public`) | **Nothing** — RLS on everywhere, no `anon` SELECT policy | **Almost everything** — ~30 tables are `authenticated USING (true)`: `agents` (bank acct, tax ID, ID-card/bookbank URLs), `kv_records` (all invoices), `tickets`/`messages` (customer chats), `brands`, `platform_notifications` (124k rows), `kv_snapshots` (15.8k) |
| Storage `payroll-docs` | Private (closed Sep 2026) | Bucket-wide read for `authenticated` |
| Edge functions with `verify_jwt=false` | They verify the JWT + `profiles.role` in the body (admin-users, kb-ai-search, share-batch, ai-draft…) | Role-gated |
| Web bundle | Public, minified, no source maps (Vite default) | — |
| Source code | **Public GitHub fork `Alampluz/Admin`** still exposes source to 3 Jun 2026 | — |

Conclusion: the two controls that matter are (1) nobody outside gets an account, and (2) an ordinary account can only read what its job needs. Everything else (crawler blocking, rate limits) is secondary.

## Current progress

### Done — live in production
1. **Database guard on account creation** — trigger `auth_users_crea_domain_guard` (BEFORE INSERT on `auth.users`, SECURITY DEFINER, `search_path=''`, EXECUTE revoked from public/anon/authenticated). Any email not matching `^[^\s@]+@crea\.asia$` is refused with SQLSTATE 42501. Tested in a rolled-back block: gmail blocked, crea.asia allowed, no probe rows left. Works regardless of the Supabase "Allow new users to sign up" switch. Not recorded in `supabase/migrations` (the MCP `apply_migration` call timed out; it was applied with plain SQL) — re-runnable SQL:
   ```sql
   create or replace function public.auth_users_crea_domain_guard() returns trigger
   language plpgsql security definer set search_path = '' as $$
   begin
     if new.email is null or lower(new.email) !~ '^[^\s@]+@crea\.asia$' then
       raise exception 'NiRM accounts must be @crea.asia addresses (got %)', coalesce(new.email,'<null>') using errcode='42501';
     end if;
     return new;
   end $$;
   revoke execute on function public.auth_users_crea_domain_guard() from public, anon, authenticated;
   create trigger auth_users_crea_domain_guard before insert on auth.users
     for each row execute function public.auth_users_crea_domain_guard();
   ```
   Reuse in another project: same SQL, change the domain regex.

### Done — code in April's working copy, NOT yet committed
Working copy: `C:\Users\April\OneDrive - Crea Co. Ltd\Documents\GitHub\Admin` (branch CREA-HQ, remote NiramolNK/Admin; April commits from GitHub Desktop; Vercel builds on push).

2. **Cloudflare Turnstile on the sign-in screen** (free, no-puzzle CAPTCHA; Supabase Auth verifies the token server-side, so a script posting to `/auth/v1/token` with a password list never gets a session):
   - `src/turnstile.js` (new): `TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_ENABLED`, `useTurnstile(containerRef, active)` → `{ token, reset, error }`; lazy-loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, renders with `size:"flexible"`, resets on expiry.
   - `src/App.jsx`: imports it; `AuthScreen` renders `<div ref={captchaRef}/>` on the plain sign-in form only (not forgot/recovery); Sign-in button disabled until a token exists; `handleSignIn(e, captcha)` passes `captcha.token` and calls `captcha.reset()` after every attempt (tokens are single-use).
   - `src/supabase.js`: `signIn(email, password, captchaToken)` → `signInWithPassword({ email, password, options: { captchaToken } })` when a token is given.
   - `.env.example`: documents `VITE_TURNSTILE_SITE_KEY`.
   - **Inert until the env var is set** — with no key the login works exactly as before. All files parse (esbuild). `index.html` has no CSP, so the Cloudflare script loads.
   - Note: `App.jsx` and `supabase.js` are CRLF files; `AllocationRoster2026.jsx` / `InvoiceApprovals.jsx` are LF. Match the file's own line endings when editing.

## What worked
- Auditing exposure with one query over `pg_policies` joined to `pg_class` (RLS flag, approx rows, which roles have SELECT) — fast and decisive.
- Enforcing the account-domain rule in the database rather than the dashboard: can't be bypassed by a setting, and the existing `admin-users` edge function already enforces the same domain, so nothing legitimate broke.
- Shipping Turnstile behind an env var so the deploy is safe and the switch-on is a config change.

## What didn't work / gotchas
- `curl` to `*.supabase.co` is blocked from both the cloud sandbox and the laptop VM (proxy 403) — you cannot probe Auth settings (`/auth/v1/settings`) or test signup from here. Verify dashboard switches by eye or by the trigger test above.
- Supabase MCP `apply_migration` on `auth.users` timed out (lock); `execute_sql` with `set lock_timeout='8s'` applied it in one go.
- Supabase Auth config (signups on/off, CAPTCHA) is not readable via SQL or the MCP — only the dashboard.
- Exact-string edits silently fail on CRLF files unless the search string uses `\r\n`.

## Next steps (in order)
1. **April — Turnstile roll-out, strictly in this order:**
   a. dash.cloudflare.com → Turnstile → Add widget, hostname `nirmroster.vercel.app` (Managed / invisible is fine) → copy site key + secret key.
   b. Vercel → nirmroster → Settings → Environment Variables → `VITE_TURNSTILE_SITE_KEY` = site key → redeploy. Check the widget shows on the login page.
   c. Supabase → Authentication → Attack Protection → Enable CAPTCHA → Turnstile → secret key. (Reverse order locks everyone out until the deploy lands.)
   d. Same screens: Supabase "Allow new users to sign up" **off**; Vercel → Firewall → **Bot Protection** managed ruleset on (Attack Challenge Mode if ever under attack).
2. **April — commit** `src/turnstile.js`, `src/App.jsx`, `src/supabase.js`, `.env.example` from GitHub Desktop.
3. **April / repo owners — the code:** make `NiramolNK/Admin` private; get the public `Alampluz/Admin` fork deleted or made private (only its owner can).
4. **Next session — the scraping lockdown (database only, no `src/` change).** This is the piece that stops a *logged-in* account dumping payroll. Plan already written in project doc `claude/nirm-progress-2026-09-24.md` (§ "RULE from April"): `kv_records` SELECT split (`domain <> 'nirm-invoices' OR is_manager() OR split_part(id,'__',1) = my_agent_id()`), owner-guard trigger, `kv_state` `nirm-invoices` manager-only, `invoice_sends` / `kv_snapshots` / `kv_record_snapshots` / `app_state_history` → supervisor/manager, `payroll-docs` storage policies narrowed to owner + supervisors with `invoice-pdfs/` manager-only, `profiles` self-create role capped. Helpers already exist: `is_manager()`, `is_supervisor()`, `my_agent_id()`.
   **Timing rule:** do NOT apply during the 18th–20th invoice-signing window or before that month's batch is shared to Finance (it changes what T1 accounts can read mid-submission). Earliest: after Prim presses Share to Finance for 2026-10. Then run that doc's post-apply test plan (T1 / T2 / manager).
5. Optional hardening afterwards: shorter JWT lifetime + refresh rotation in Supabase Auth; revoke leavers' accounts the day they leave (an ex-agent's login is the realistic scraping path); drop the 9 Aug-2026 `*_backup_*` tables that still hold agent data.

## Reusable checklist for any other CREA app on the same stack
1. Query `pg_policies`: no `anon` SELECT anywhere; list every `authenticated USING (true)` table and ask "does every staff login need all of this?"
2. Domain-guard trigger on `auth.users` (SQL above).
3. Turnstile on login, env-var gated, Supabase CAPTCHA enabled last.
4. Signups off in Supabase Auth; Vercel Bot Protection on; robots.txt disallow-all (NiRM already has one blocking GPTBot, ClaudeBot, CCBot, Bytespider, etc.).
5. Edge functions with `verify_jwt=false` must verify the JWT and role in the body (CORS preflight is why the gateway check is off).
6. Keep source repos private; check for public forks.
