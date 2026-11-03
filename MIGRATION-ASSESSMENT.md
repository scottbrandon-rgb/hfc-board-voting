# Supabase → Netlify Database: Migration Assessment

**Site:** HFC Deacon Board voting (`board.harrisonfaith.church`)
**Supabase project:** `hfc-board-voting` (us-west-1)
**Date:** 2026-11-03

---

## Short answer

**Yes. On usage alone, this is an ideal app to move off Supabase.** It is about as light a database load as a real app can have. The work is real but bounded, and Claude Code can do almost all of it. The catch is that the app uses **Supabase for three things, not one**: the database, sign-in, and file storage. Netlify Database replaces only the first. Sign-in is the part that needs care.

**Recommendation:** Migrate, but only after you check two things (Section 6). Do it **before** the board starts real voting, while the data is still test data.

---

## 1. How much does the app use the database?

Live numbers from the production project today:

| Measure | Value |
|---|---|
| Database size | 13 MB (mostly Postgres's own system tables) |
| Members | 6 |
| Motions | 5 (first one on 2026-05-01) |
| Votes | 15 |
| Audit-log rows | 62 |
| Sign-in accounts | 9 |
| Stored files | 10 files, ~1.4 MB (5 attachments, 5 PDFs) |

Expected growth: a board of six that handles maybe 2–6 motions a month. After ten years this database would still be under 50 MB. Traffic is a handful of people signing in a few times a week, plus one scheduled job every 15 minutes.

**Verdict on load:** It uses a tiny fraction of even Netlify's free limits (5 GB storage, 5 GB writes, 5 GB bandwidth per database).

### Your Supabase slots right now

| Project | Status |
|---|---|
| `hfc-board-voting` | **Active** (this app) |
| `hfc-budget-2027` | **Active** |
| `kingdom-men` | Paused |
| `harrison-faith-signups` | Paused |

Both free active slots are taken. One of them is going to an app that barely uses it. Your reasoning holds.

---

## 2. What the app actually uses from Supabase

| Supabase feature | How the app uses it | Netlify replacement | Difficulty |
|---|---|---|---|
| **Postgres database** | 15 migrations; a 1,183-line voting engine (`015_unanimous_voting.sql`) with ~23 database functions and triggers that enforce the voting rules and keep the record append-only | **Netlify Database** (managed Postgres) | Low–Medium. Postgres to Postgres, so most of the SQL moves over. |
| **Supabase-only SQL** | ~135 references to `auth.uid()`, the `auth` and `storage` schemas, RLS policies, and the `service_role` role | Rewrite: checks move into the app's data layer (`src/lib/dal.ts`) or onto a database setting the app sets per request | **Medium.** This is the careful part. |
| **Auth (8-digit email code)** | `signInWithOtp` / `verifyOtp`, session cookies refreshed in `src/proxy.ts`, chair creates accounts via `auth.admin.createUser` | Custom sign-in: generate the code, email it through **Resend** (already in use), store a hashed code and a session in the database | **Medium–High.** Security-sensitive. |
| **Storage (2 private buckets)** | Signed upload URLs for attachments, generated motion PDFs, signed download links | **Netlify Blobs**, served through an app route that checks sign-in | Low–Medium |
| **Query client** | `supabase-js` query builder in ~16 files (~75 calls) and 13 `.rpc()` calls | `@netlify/database` with plain SQL, or Drizzle | Medium. Mechanical but wide. |

### Why not Netlify Identity for sign-in?

Netlify reversed its deprecation of Identity in February 2026, so it is supported again. Even so, it is a poor fit here. As far as I know it is built around passwords, invite links and Google/GitHub sign-in, not the 8-digit email code your board already uses. Six members is also small enough that a custom code-by-email system is simple. It also keeps everything in one place (Netlify plus Resend) with no third auth vendor. Before choosing, confirm in Identity's current docs whether it now supports email codes.

---

## 3. What it would take (with Claude Code doing the work)

**Step 1: Set up the database (1 session)**
- Create Netlify Database on the site and port the migrations into `netlify/database/migrations/`.
- Strip the Supabase-only parts: the `auth`/`storage` schemas, `service_role` grants, and RLS policies tied to `auth.uid()`.
- Run the existing `npm run test:db` voting-engine tests against plain Postgres. They already run on a scratch local Postgres with stubs (`supabase/tests/supabase_stubs.sql`), so most of the testing is already in place. That is a real head start.

**Step 2: Replace sign-in (1–2 sessions)**
- Add `login_codes` and `sessions` tables, then code generation, Resend email, verification with rate limits and expiry, and HTTP-only session cookies.
- Rewrite `src/proxy.ts`, `src/lib/dal.ts` and the login and sign-out routes.

**Step 3: Replace queries and storage (1–2 sessions)**
- Convert the ~75 query calls and 13 function calls to SQL.
- Move attachments and PDFs to Netlify Blobs, with a download route that checks sign-in.

**Step 4: Move the data and cut over (1 session plus your time)**
- Copy 6 members, 5 motions, votes, the audit log and 10 files. With this little data, it is a script, not a project.
- Update the health check and `PRODUCTION.md`, deploy, and test the full go-live checklist.
- Members sign in once more (their old sessions end).

**Rough total:** 4–6 focused Claude Code sessions. **Your time:** about 2–4 hours spread across the work, mostly Netlify dashboard setup, reviewing, and walking one motion through the whole process on your phone.

---

## 4. Push-back: reasons to hesitate

1. **You lose database-level security.** Right now RLS is a second lock. Even if app code has a bug, Postgres refuses to show a draft to the wrong person. After the move, the app's own code is the only lock unless Claude Code rebuilds an equivalent (it can, using a per-request database setting, but that adds work). The voting rules themselves stay in the database, so the most important safeguard survives.
2. **Home-grown sign-in is the riskiest code in the app.** Supabase Auth has been tested by thousands of apps. A custom version needs rate limits, code expiry, single use, and protection against guessing. Claude Code can write it well, but it deserves a careful review.
3. **The scheduled job may fight the free plan.** Netlify Database on Free sleeps after 5 idle minutes and allows **48 compute units per database per billing period**. A job every 15 minutes wakes it about 96 times a day, so it could stay awake about a third of the time. Depending on how Netlify counts a compute unit, that could come close to or exceed the free cap. **Fix:** run the job hourly (reminders at 24 and 4 hours don't need 15-minute precision), or skip the database when no vote is open. This is easy to do, but it must be part of the plan.
4. **Netlify Database is new.** It became generally available on 2026-04-28, and storage billing was announced as starting "no earlier than July 1, 2026." It is a younger product than Supabase. Prices and limits may still change.
5. **A cheaper alternative exists.** You could put this app and `hfc-budget-2027` into **one** Supabase project, each in its own schema. That frees a slot with far less code change. The trade-offs: both apps share one sign-in user list and one pause/backup policy, and a problem in one can affect the other. For a church board's official record, I'd still lean toward separating them.

---

## 5. Reasons it's worth doing (looking ahead)

- **Frees a Supabase slot for an app that needs it,** which is your main goal.
- **Better backups than you have now.** `PRODUCTION.md` notes that Supabase Free has no downloadable backups. Netlify Free keeps **3 days** of scheduled backups. For an official board record, that is an improvement.
- **No more 7-day pause risk.** Supabase Free pauses inactive projects. Netlify Database sleeps and wakes on its own.
- **One vendor fewer.** Hosting, database, files and scheduled jobs all live on Netlify; email stays on Resend.
- **Preview deploys get their own database copy,** so testing changes never touches the real board record.
- **Timing is ideal.** The data is test data, and the go-live checklist isn't finished. Migrating after real minutes and votes pile up is harder and more consequential.

---

## 6. Check these before starting

1. **Your Netlify plan type.** Netlify Database is offered "on credit-based plans only." If your team is on an older (legacy) Netlify plan, you may need to switch plans first. Look under Netlify → Team settings → Billing.
2. **How Netlify counts a "compute unit."** Confirm it on the billing page so the scheduled job doesn't run past the 48-unit free cap (see 4.3).

If both are fine: **migrate.** If the plan is legacy and switching isn't wanted, the shared-Supabase-project option (4.5) is the fallback.

---

## Sources

- [Netlify Database is now generally available (changelog, 2026-04-28)](https://www.netlify.com/changelog/2026-04-28-netlify-database/)
- [Netlify Database docs](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Netlify Database billing and usage limits](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/)
- [Netlify Blobs docs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Netlify Identity status update (Auth0 extension post, updated 2026-02-19)](https://www.netlify.com/blog/auth0-extension-identity-changes/)
- [Original Netlify Identity deprecation notice (Feb 2025, since reversed)](https://netlify.com/changelog/deprecation-netlify-identity)
- Live query of the `hfc-board-voting` Supabase project, and this repository's code
