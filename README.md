# HFC Deacon Board

Motions, online votes and meeting records for the Harrison Faith Church Deacon
Board. Next.js 16 (App Router), all on Netlify: Netlify Database (Postgres),
Netlify Blobs (documents and PDF records) and the app's own email-code sign-in.
Resend sends the email.

Moving from Supabase? Follow `MIGRATION.md`.

## Online voting rules

- Five voting members (including the secretary) plus the chair. The chair does
  not move, second or vote online, but writes motions, calls for a motion,
  sends reminders and can refer any motion to the in-person meeting (with a
  note).
- A published motion needs a mover and a different seconder. Seconding opens
  voting for the chosen period (3, 5 or 7 days), if at least three voting
  members are seated.
- Each member votes **Aye** or **Discuss in person** (with an optional reason).
  Votes are visible to the board as they are cast and can be changed until
  voting closes.
- Approval online is unanimous: the moment every seated voting member has
  voted Aye, the motion is approved. Anything else at the deadline sends it to
  the in-person meeting. Approved motions are ratified at the next meeting.

The rules are enforced in the database (`netlify/database/migrations/0001_baseline.sql`):
server actions call the `vote_*` functions, and triggers keep the record
append-only. `src/lib/rules.ts` holds the shared labels and calculations.

## How it fits together

- **Database:** `src/lib/db.ts` (Netlify Database through `@netlify/database`).
  Netlify applies `netlify/database/migrations` before each deploy is
  published; a failing migration stops the deploy. Add changes as new
  numbered files (`0003_….sql`); never edit one that has shipped.
- **Sign-in:** `src/lib/session.ts`. An 8-digit code by email (only to active
  board members), then a 90-day session in an HTTP-only cookie. The database
  stores only hashes of codes and session tokens.
- **Who sees what:** every page and action checks the session in
  `src/lib/dal.ts`. Drafts are visible to the chair, the secretary and their
  author (`src/lib/queries.ts`).
- **Files:** `src/lib/storage.ts` (Netlify Blobs; private, read only through
  `/files/...` after the session check). Uploads go in 4 MB pieces through
  `/api/attachments/upload`; documents are limited to 20 MB.
- **Push notifications:** `src/lib/push.ts`, `public/sw.js`. Every notice in
  `src/lib/notify.ts` is sent as an email and as a push notification to the
  same people (a member's push reaches the devices they switched on under
  Profile → This device). Nobody composes or triggers them: they fire from the
  same events as the emails. A member moving a motion also sends a push (and no
  email) so the others know it needs a second. Each batch is logged
  (`[push] sending …`) and recorded as a `push_sent` row in the audit log; the
  chair's call, referral, extension and ratification screens say it was sent.
  Needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; without them nothing is
  pushed and Profile hides the switch. On iPhone it works only from the Home
  Screen app (iOS 16.4+).
- **Previews:** deploy previews get their own copy of the database and their
  own file stores, and log notices instead of emailing or pushing to the board. Sign-in
  codes are still sent.

## Development

```bash
cp .env.local.example .env.local   # a local Postgres URL, CRON_SECRET
createdb hfc_board
for f in netlify/database/migrations/*.sql; do psql hfc_board -f "$f"; done
psql hfc_board -f tests/db/fixtures.sql   # optional: a sample board
npm install
npm run dev                          # sign-in codes print in this terminal
```

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test          # unit tests (Node's built-in test runner)
npm run test:db   # applies every migration to a scratch local PostgreSQL
                  # database and runs the voting-engine tests in tests/db
                  # (needs psql; set PGURL if not postgres:postgres@localhost)
npm run build
```

`npm run icons` redraws the HF app icons.

## Background jobs

`netlify/functions/cron-background-jobs.mts` runs every 15 minutes and calls
`POST /api/cron/background-jobs` with `Authorization: Bearer $CRON_SECRET`.
It closes votes past their deadline and sends reminders about 24 hours and
4 hours before a deadline.

See `PRODUCTION.md` for deployment steps and dashboard settings.
