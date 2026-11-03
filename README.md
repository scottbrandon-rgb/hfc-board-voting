# HFC Deacon Board

Motions, online votes and meeting records for the Harrison Faith Church Deacon
Board. Next.js 16 (App Router) on Netlify, with Netlify Database (Postgres)
and Netlify Blobs (documents and PDF records). Resend sends email, including
the 8-digit sign-in codes.

Until November 2026 the site ran on Supabase. The old migrations are kept in
`archive/supabase/`; `MIGRATION-STEPS.md` is the checklist for the move.

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
server actions call its voting functions, and triggers keep the record
append-only. Only the site's server connects to the database. Who may see
what (drafts, PDF records) is checked in `src/lib/queries.ts` and the routes
under `src/app/api/files`. `src/lib/rules.ts` holds the shared
labels and calculations.

## Development

```bash
cp .env.local.example .env.local   # a local DATABASE_URL, CRON_SECRET
npm install
for f in netlify/database/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
npm run dev
```

Without `RESEND_API_KEY`, sign-in codes are printed in the terminal. A fresh
database has no members: add one with SQL, or copy real records through
`/setup/import`. (`netlify dev` can also run a local database; see Netlify's
docs.)

## Database changes

Netlify applies new files in `netlify/database/migrations` on each deploy
(deploy previews get their own copy of the database). Name them
`0003_short_description.sql` and so on. Never edit a migration that has
already run; add a new one.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test          # unit tests (Node's built-in test runner)
npm run test:db   # applies the migrations to a scratch local PostgreSQL
                  # database (twice) and runs the voting-engine tests
                  # (needs psql; set PGURL if not postgres:postgres@localhost)
npm run build
```

`npm run icons` redraws the HF app icons.

## Background jobs

`netlify/functions/cron-background-jobs.mts` runs every hour and calls
`POST /api/cron/background-jobs` with `Authorization: Bearer $CRON_SECRET`.
It closes votes past their deadline and sends reminders about 24 hours and
4 hours before a deadline.

See `PRODUCTION.md` for deployment steps and dashboard settings.
