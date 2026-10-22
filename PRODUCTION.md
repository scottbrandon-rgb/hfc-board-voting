# Production Checklist — HFC Board Voting Platform

Everything here is done by a person in an external dashboard. Code changes
are tracked in git; these are one-time platform settings.

---

## Deploying the unanimous-voting update (migration 015)

This release changes the voting rules (unanimous online approval, Aye or
Discuss in person) and moves those rules into the database. **The database
change must be applied before the new code goes live**, and the old code
cannot vote once the migration is applied. Do the two steps back to back, at
a quiet time:

1. **Confirm migrations 012–014 are applied** (Supabase → Database →
   Migrations, or run `select * from supabase_migrations.schema_migrations`).
2. **Look at what's in progress and who can vote** (Supabase → SQL editor):

   ```sql
   select motion_number, title, status, created_at from public.motions
    where status in ('open', 'moved', 'seconded', 'voting') order by created_at;

   select full_name, email, role, is_active from public.members order by role, full_name;
   ```

   Decide what to do with any test motions first: before the migration they
   can still be deleted; afterwards only drafts can be.

   **Archived motions.** The previous app archived a motion by overwriting
   its status with `archived` and logging the real status. The migration
   restores each one's real outcome from that log and keeps "archived" as a
   separate marker (hidden from the meeting lists; the chair can unarchive).
   Preview what each will become:

   ```sql
   select m.motion_number, m.title,
          (select a.event_data ->> 'previous_status' from public.audit_log a
            where a.motion_id = m.id and a.event_type = 'archived'
            order by a.created_at desc limit 1) as restored_status
     from public.motions m where m.status = 'archived';
   ```

   If any `restored_status` is empty, the migration stops and names the
   motion; set its status to the real outcome first.

3. **Set the board's real voting members before the migration.** The migration
   freezes today's active voting members as the voters on any motion that is
   seconded or voting. Migration 005 switched the five real members off for
   testing, so turn them back on and switch the test account off:

   ```sql
   update public.members set is_active = true
    where email in ('Buster.Burns@mail.signature.bank', 'samwilson@harrisonfaith.org',
                    'malcolmrd@hotmail.com', 'jyoungblood@harrisonfaith.org',
                    'trevorgibbins@harrisonfaith.org');
   update public.members set is_active = false where email = 'bigbodyscotty@gmail.com';
   ```

   If motions are seconded or voting and fewer than three voting members are
   active, the migration stops with a message and changes nothing.

4. **Apply `supabase/migrations/015_unanimous_voting.sql`** in the Supabase
   SQL editor (or `supabase db push`). It runs as one transaction: it either
   applies completely or not at all.
   - Motions already decided keep their old results, labelled "(previous rules)".
   - Motions in progress switch to the new rules. A vote already open gets a
     deadline of five days after it opened, or one day from now if later.
     Earlier Nay/Abstain ballots count as "not Aye"; members can change them.
   - A seconded motion opens for voting with the five members as its voters.
5. **Merge to `main` right away.** Netlify builds and deploys in about three
   minutes. Until it finishes, voting on the old site shows an error. Nothing
   is lost or recorded wrongly, because the database refuses it.
6. Check `https://board.harrisonfaith.church/api/health` returns `{"ok":true}`.

### Then, on the new site (signed in as chair)

- **Board page:** it should read "All five voting seats are filled." Set the
  secretary's role if it is not already set.
- **Meeting page:** set the next meeting date.

---

## Supabase

### ✅ Already done

- RLS enabled on all tables
- Both storage buckets private (`motion-attachments`, `motion-pdfs`)
- Email OTP (8-digit code) sign-in

### 🔲 Turn off public sign-ups (security)

Dashboard → Authentication → Sign In / Providers → **Allow new users to sign up: off**.
The app now creates sign-in accounts itself when the chair adds a member, and
the sign-in form never creates accounts, so turning this off stops anyone else
from registering an account in the project.

### 🔲 Backups (recommended: Pro plan)

The project's logs keep only about a day of history, which suggests the Free
plan. Free has no downloadable backups and pauses after a week of inactivity.
For a permanent board record, upgrade to Pro (daily backups; add
Point-in-Time Recovery if desired).
Dashboard → Project Settings → Billing / Database → Backups.

### 🔲 Auth URL configuration

Dashboard → Authentication → URL Configuration

- Site URL: `https://board.harrisonfaith.church`
- Redirect URLs: `https://board.harrisonfaith.church/auth/callback`

---

## Resend

### 🔲 Verify the sending domain

1. resend.com → Domains → Add Domain → `harrisonfaith.org`
2. Add the DKIM, SPF and DMARC records it lists at your DNS provider
3. Confirm `RESEND_FROM_EMAIL=board@harrisonfaith.org` is set on Netlify

Until the domain is verified, Resend rejects mail from that address.

---

## Netlify

### ✅ Already done

- GitHub connected; `main` auto-deploys
- Custom domain `board.harrisonfaith.church`
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`,
  `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, optionally `TIMEZONE` (default `America/Chicago`)

### 🔲 Confirm the scheduled job runs

Netlify → Logs → Functions → `cron-background-jobs`. Every 15 minutes it
closes votes past their deadline and sends reminders. Before this update
every run failed (the request was redirected to the sign-in page). Each run
should now log `{"ok":true,...}`. A failing run is logged as an error.

### 🔲 Watch it (recommended)

Add a free uptime monitor (for example UptimeRobot) on
`https://board.harrisonfaith.church/api/health`, alerting by email when it is
not 200.

### 🔲 Protect preview deploys (optional)

Netlify → Site configuration → Visitor access: require a password on
non-production deploys.

---

## Health check

```
curl https://board.harrisonfaith.church/api/health
```

Publicly it returns only `{"ok":true|false,"timestamp":…}`. For the details,
send the cron secret:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://board.harrisonfaith.church/api/health
```

The details cover each setting, the database, the voting-rules migration and
both storage buckets (they must be private).

---

## Go-live checklist

- [ ] Test motions dealt with; five real voting members active and the test account off (before the migration)
- [ ] Migration 015 applied, then `main` deployed
- [ ] `/api/health` returns ok (and `voting_rules_migration: ok` in the detailed view)
- [ ] Public sign-ups off in Supabase
- [ ] Board page shows all five seats filled; secretary set
- [ ] Resend domain verified
- [ ] One motion taken through the whole process: draft → publish → move →
      second → five Ayes (approved) → ratified at the meeting; PDF downloads
- [ ] One motion referred (a "Discuss in person" vote, or the chair's Refer)
      and its outcome recorded on the Meeting page
- [ ] Scheduled job logging `ok: true` every 15 minutes
- [ ] Each member signs in once on their phone (and adds it to the Home Screen)
