# Production Checklist — HFC Board Voting Platform

Everything here is done by a person in an external dashboard. Code changes
are tracked in git; these are one-time platform settings.

Moving from Supabase to Netlify? Follow `MIGRATION.md` first; this file
describes the settled, all-Netlify setup.

---

## Netlify

### ✅ Already done

- GitHub connected; `main` auto-deploys
- Custom domain `board.harrisonfaith.church`

### 🔲 Netlify Database

Project → **Data & Storage → Database**. One database for production; each
deploy preview gets its own copy, made when the preview is first built.

- Migrations in `netlify/database/migrations` are applied automatically before
  a deploy is published. A failed migration stops the deploy, and the live
  site keeps running the previous version.
- **Backups:** the Free plan keeps 3 days of scheduled backups, Personal 7,
  Pro 30. The board's record is permanent, so take a manual backup after
  important meetings, or choose a plan with longer retention:

  ```bash
  netlify database status --show-credentials   # prints the connection string
  pg_dump "<connection string>" > hfc-board-$(date +%F).sql
  ```

### 🔲 Environment variables

Project configuration → Environment variables. Set for all scopes, and for
Production and Deploy Previews:

| Variable                         | Notes                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                 | Sends sign-in codes and notices                                                   |
| `RESEND_FROM_EMAIL`              | `board@harrisonfaith.org`                                                         |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | `https://board.harrisonfaith.church`                                              |
| `CRON_SECRET`                    | `openssl rand -hex 32`; protects the scheduled job, health details and the import |
| `TIMEZONE`                       | optional, default `America/Chicago`                                               |

`NETLIFY_DB_URL` is set by Netlify; do not set it yourself. Never set
`LOCAL_STORAGE_DIR` on Netlify (it is for local development only).

### 🔲 Confirm the scheduled job runs

Netlify → Logs → Functions → `cron-background-jobs`. Every 15 minutes it
closes votes past their deadline and sends reminders. Each run should log
`{"ok":true,...}`. A failing run is logged as an error.

### 🔲 Watch it (recommended)

Add a free uptime monitor (for example UptimeRobot) on
`https://board.harrisonfaith.church/api/health`, alerting by email when it is
not 200.

### 🔲 Protect preview deploys (optional, recommended)

Netlify → Site configuration → Visitor access: require a password on
non-production deploys. Previews hold a copy of the board's records.
(Previews never email the board; they only log what they would have sent.
Sign-in codes are still sent, so testers can sign in.)

---

## Resend

### ✅ Account and sending domain set up

Sign-in codes and notices are emailed by Resend, so keep these in step: the
domain in `RESEND_FROM_EMAIL` on Netlify (today `board@harrisonfaith.org`)
must stay **Verified** in resend.com → Domains. If Resend ever refuses the
mail, nobody can sign in.

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

The details cover each setting, the database, the voting rules, the sign-in
tables, the number of active members and both file stores.

---

## Go-live checklist

- [x] Resend set up (sending domain matches `RESEND_FROM_EMAIL`)
- [ ] `/api/health` returns ok (detailed view: every check `ok`/`set`)
- [ ] Board page shows all five seats filled; secretary set
- [ ] One motion taken through the whole process: draft (with a document) →
      publish → move → second → five Ayes (approved) → ratified at the
      meeting; the document opens and the PDF downloads
- [ ] Scheduled job logging `ok: true` every 15 minutes
- [ ] Each member signs in once on their phone (and adds it to the Home Screen)
