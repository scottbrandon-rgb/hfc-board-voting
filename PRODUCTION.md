# Production Checklist — HFC Board Voting Platform

Everything here is done by a person in an external dashboard. Code changes
are tracked in git; these are one-time platform settings.

The site runs entirely on Netlify (site, database, files, scheduled job),
with Resend for email. The move from Supabase is a separate, one-time
checklist: **`MIGRATION-STEPS.md`**.

---

## Netlify

### ✅ Already done

- GitHub connected; `main` auto-deploys
- Custom domain `board.harrisonfaith.church`
- Environment variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`,
  `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, optionally `TIMEZONE` (default `America/Chicago`)

### Database (Netlify Database)

- Project → **Data & Storage → Database**. Netlify creates it on the first
  deploy and applies `netlify/database/migrations` before each deploy is
  published. A failed migration stops the deploy from going live, so the
  site never runs against a half-changed database.
- Backups: one a day, plus one each time a deploy is published. The free plan
  keeps 3 days. To restore (Team Owner only): Data & Storage → Database →
  Backups → **Restore** next to the backup. Netlify keeps a copy of the
  database as it was just before the restore.
- Each deploy preview gets its own copy of the database. Changes made on a
  preview never reach the live site.

### Files (Netlify Blobs)

- Project → **Data & Storage → Blobs**. Two stores: `motion-attachments`
  (documents) and `motion-pdfs` (official records). Files are private: the
  site serves them only to signed-in members (records: chair and secretary).
- Documents are limited to 15 MB each (Netlify serves at most 20 MB per download).

### Scheduled job

Netlify → Logs → Functions → `cron-background-jobs`. Once an hour it closes
votes past their deadline and sends reminders. Each run should log
`{"ok":true,...}`; a failing run is logged as an error.

It runs hourly rather than every 15 minutes because each run wakes the
database, and the free plan limits database time. Nobody can vote after a
deadline either way; the hourly job only records the outcome (within the hour)
and sends the emails.

### 🔲 Watch it (recommended)

Add a free uptime monitor (for example UptimeRobot) on
`https://board.harrisonfaith.church/api/health`, alerting by email when it is
not 200.

### 🔲 Protect preview deploys (optional)

Netlify → Site configuration → Visitor access: require a password on
non-production deploys.

---

## Resend

Sign-in codes are sent through Resend, so **if Resend stops working, nobody
can sign in.**

### Verify the sending domain

1. resend.com → Domains → `harrisonfaith.org` must show **Verified**
2. If not: Add Domain, then add the DKIM, SPF and DMARC records it lists at
   the DNS provider
3. Confirm `RESEND_FROM_EMAIL=board@harrisonfaith.org` is set on Netlify

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

The details cover each setting, the database and its migrations, the number
of active members, and file storage.

---

## Go-live checklist (after the move)

- [ ] `/api/health` returns ok
- [ ] Board page shows all five seats filled; secretary set
- [ ] One motion taken through the whole process: draft (with a document) →
      publish → move → second → five Ayes (approved) → ratified at the
      meeting; PDF downloads
- [ ] One motion referred (a "Discuss in person" vote, or the chair's Refer)
      and its outcome recorded on the Meeting page
- [ ] Scheduled job logging `ok: true` every hour
- [ ] Each member signs in once on their phone (and adds it to the Home Screen)
