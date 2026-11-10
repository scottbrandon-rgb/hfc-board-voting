# Moving the Deacon Board site from Supabase to Netlify

The site already runs on Netlify. Supabase supplied three things, and each now
has a Netlify home:

| Supabase did                    | Now                                         | Where in the code                              |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Postgres database, voting rules | **Netlify Database** (Postgres), same rules | `netlify/database/migrations`, `src/lib/db.ts` |
| Sign-in (8-digit email codes)   | **The app itself**, codes emailed by Resend | `src/lib/session.ts`, `src/app/login`          |
| File storage (documents, PDFs)  | **Netlify Blobs** (private)                 | `src/lib/storage.ts`, `src/app/files`          |

The voting rules are the same database functions, copied exactly from the
production Supabase project. The Supabase records and files are copied once
by a protected import route. Supabase is only read during the move, never
changed, so it stays as a fallback.

**Time needed:** about an hour, including a full rehearsal. The site is
unavailable for 5 to 10 minutes at the switch.

---

## What members will notice

- **Everyone signs in once more.** Same screen, same 8-digit code. The email
  now comes from `board@harrisonfaith.org`, and the code is in the subject line.
- **Documents are limited to 20 MB** (it was 25 MB). Today's largest is 0.6 MB.
- Document links no longer expire after an hour.
- Nothing else changes: motions, votes, comments, history, PDFs and email
  preferences all carry over.

---

## Before you start

1. **Resend is already set up.** Sign-in codes now come from Resend instead of
   Supabase, so one quick check: the domain in `RESEND_FROM_EMAIL` on Netlify
   (today `board@harrisonfaith.org`) must be the domain shown as **Verified**
   in resend.com → Domains. If they differ, change `RESEND_FROM_EMAIL` to an
   address on the verified domain.
2. **Check the Netlify plan.** Netlify Database runs on credit-based plans. The
   Free plan is enough for the board (5 GB, which is far more than you need)
   but keeps only 3 days of backups; Pro keeps 30. Decide which you want.
3. **Pick a quiet time** for the switch (Step 5), when no vote is about to
   close, and tell the board the site will be down for about ten minutes.
4. **Find your `CRON_SECRET`.** Netlify → Project configuration → Environment
   variables → `CRON_SECRET`. If Netlify won't reveal it (it is marked
   secret), set a new value (`openssl rand -hex 32` in Terminal) and save it;
   the next deploy picks it up.

You will run a few commands in Terminal (Mac: Applications → Utilities →
Terminal). In each step, first set these two lines, using your secret:

```bash
export CRON_SECRET='paste-the-secret-here'
export SITE='https://board.harrisonfaith.church'
```

---

## Step 1 — Create the database

Netlify → your project → **Data & Storage → Database → Create database**.
(If you skip this, Netlify creates it automatically on the first deploy that
needs it.) Netlify sets `NETLIFY_DB_URL` for you; do not set it yourself.

## Step 2 — Check the environment variables

Netlify → Project configuration → Environment variables. Make sure these
exist, with **Functions** included in their scopes and with values for both
**Production** and **Deploy Previews**:

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (keep them for
  now: the import reads Supabase with them)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`

## Step 3 — Open the pull request

The work is on the branch `claude/happy-albattani-0t3m57`. Open a pull
request into `main` (or ask Claude to). Netlify builds a **deploy preview**
for it. The preview gets **its own copy of the database** and its own file
storage, so nothing you do there touches production. Its address is on the
pull request, like `https://deploy-preview-4--<site>.netlify.app`.

## Step 4 — Rehearse on the preview

Set `SITE` to the preview address, then:

```bash
# 1. What's where (Supabase counts, and empty Netlify tables)
curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/migrate/supabase"

# 2. Copy the records (all-or-nothing; "matches": true means every count agrees)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/migrate/supabase?step=data"

# 3. Copy documents and PDFs (repeat until "done": true)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/migrate/supabase?step=files"

# 4. Health: every check should be "ok" or "set"
curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/health"
```

Then open the preview in a browser, sign in with your own board email (codes
are sent from previews), and look around: motions, a document, a PDF record,
the meeting page, the board page. Previews **do not email the board**; they
only log what they would have sent.

In the file step, `notInSupabase` listing a few `motion-pdfs/…` entries is
normal: those PDFs were never generated. `fingerprintMismatch` or `failed`
should be empty.

## Step 5 — Switch over

At the quiet time:

1. **Merge the pull request** into `main`. Netlify builds (about three
   minutes), sets up the production database tables, then publishes.
   Until you finish item 2, the site will say members aren't on the board list.
2. **Copy the data into production**, the same commands as Step 4 with the real
   address:

   ```bash
   export SITE='https://board.harrisonfaith.church'
   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/migrate/supabase?step=data"
   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/migrate/supabase?step=files"
   curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/health"
   ```

3. **Sign in** on the live site and open a motion.

The copy takes what Supabase holds at that moment, so ask the board not to
vote or comment between the merge and the end of item 2.

## Step 6 — Check it

- [ ] `/api/health` (with the secret) shows every check `ok`/`set`
- [ ] Motions, votes and comments look as they did
- [ ] A document opens; a decided motion's PDF downloads (chair or secretary)
- [ ] Netlify → Logs → Functions → `cron-background-jobs` logs `ok: true`
      within 15 minutes
- [ ] Each member signs in once on their phone

## Step 7 — Keep Supabase as a fallback for two weeks

Leave Supabase alone; the move never changed it.

**To roll back:** on GitHub, revert the merged pull request. Netlify
redeploys the previous version, which reads Supabase again. Anything recorded
on Netlify after the switch would then be missing from Supabase, so decide
early if you need to.

## Step 8 — Clean up (after two weeks)

1. Ask Claude to **remove the one-time import** (`src/lib/import-supabase.ts`,
   `src/app/api/migrate/supabase`, and the `@supabase/supabase-js` package).
2. Netlify → Environment variables: delete `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Supabase: download a final backup (Database → Backups, or `pg_dump`), then
   pause or delete the `hfc-board-voting` project.

---

## If something goes wrong

| What you see                              | What to do                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Deploy failed at "database migrations"    | Nothing changed on the live site. Send Claude the deploy log.                                       |
| `step=data` says "already has board data" | It was already copied. To copy again from scratch, add `&replace=1` (this also signs everyone out). |
| `"matches": false`                        | Run `step=data&replace=1` once more; if it persists, send Claude the output.                        |
| `step=files` shows `"done": false`        | Run it again; each call copies what it can in about seven seconds.                                  |
| "We couldn't send a code" at sign-in      | Resend is refusing the mail: check the domain is verified and `RESEND_API_KEY` is set.              |
| `401 Unauthorized` from the commands      | `CRON_SECRET` in Terminal doesn't match Netlify's.                                                  |
