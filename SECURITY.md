# Security

NiRM holds staff payroll records, Thai national ID and bank-book images, and
customer correspondence for brands CREA operates on behalf of. Treat this
repository accordingly.

## Reporting a problem

Email **niramol.k@crea.asia** with `SECURITY` in the subject. Do not open a
public issue for anything exploitable.

## What is switched on

| Control | Where | Cost |
|---|---|---|
| Dependabot alerts + security updates | Repo → Settings → Advanced Security | Free on private repos |
| Dependabot update PRs | `.github/dependabot.yml` | Free |
| Secret scanning (gitleaks) | `.github/workflows/security.yml` | Free — runs in Actions |
| Dependency audit | `.github/workflows/security.yml` | Free |
| CodeQL | `.github/workflows/codeql.yml` | **Needs GitHub Advanced Security on a private repo** |

GitHub's own secret scanning and push protection are free on public repos but
require the paid Advanced Security add-on on private ones. That is why gitleaks
runs in Actions instead — it does the same job for nothing. If Advanced Security
is ever purchased, enable native scanning and keep gitleaks as a second pass.

## Settings that are not in this repo

These have to be clicked in the GitHub UI; a file cannot set them.

1. **Settings → Advanced Security → Dependabot alerts:** on.
2. **…→ Dependabot security updates:** on.
3. **Settings → Rules → Rulesets**, targeting `CREA-HQ`:
   - require a pull request before merging
   - block force pushes
   - block branch deletion
   - require the `security` workflow to pass
4. **Settings → Actions → General → Workflow permissions:** read-only by
   default. Nothing here needs write.
5. **Settings → Collaborators:** review quarterly. Everyone with write access
   to this repo can deploy to production through Vercel.
6. **Two-factor authentication** required for every account with access.

## Known issues

### `xlsx` 0.18.5 — high severity, no upgrade available on npm

`xlsx@0.18.5` is the newest version published to npmjs.com, and it is affected
by CVE-2023-30533 (prototype pollution). The fix landed in 0.19.3, which
SheetJS publishes only from their own CDN — npm's `latest` tag has been stuck at
0.18.5 since they left the registry.

So `npm audit` reports a high-severity finding that cannot be resolved by a
version bump, and Dependabot cannot open a PR for it. This is expected, and it
is why the audit step does not fail the build.

The fix, when someone has time to test it, is to install from the vendor:

```
npm remove xlsx
npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Exports are used across payroll and allocation, so this needs a real test of the
XLSX download paths before it ships.

### Secrets that ship in the client bundle

Anything in `src/` reaches the browser and is readable by anyone who opens
developer tools. Two values live there today:

- **`TEL_TOKEN`** in `src/ServiceCRM.jsx` — the shared token for the `telephony`
  edge function. It is only used by the "Simulate incoming call" test button,
  but it is the same token 3CX uses to post real call events, so anyone can
  forge a call event and pop an incoming-call card on every agent's screen.
  It should be moved server-side, or the simulate button should call an
  authenticated endpoint instead.
- **`EMAILJS_PUBLIC_KEY`** in `src/AllocationRoster2026.jsx` — public by design,
  but EmailJS templates can be triggered by anyone holding it unless domain
  restrictions are enabled in the EmailJS dashboard. Worth confirming they are.

The Supabase publishable key is also in the bundle. That one is fine — it is
meant to be public, and row-level security is what protects the data behind it.

## Rules for contributors

- Never commit a `.env`. Use `.env.example` for the shape of it.
- Never put a service-role key, SendGrid key or channel access token in `src/`.
  Those belong in Supabase function secrets, read via `Deno.env.get()`.
- A secret that has been committed is compromised even after the commit is
  removed. Rotate it, then clean the history.
