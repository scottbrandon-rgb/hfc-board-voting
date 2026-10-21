# HFC Deacon Board

Motions, online votes and meeting records for the Harrison Faith Church Deacon
Board. Next.js 16 (App Router) on Netlify, Supabase (Postgres, auth, storage),
Resend for email.

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

The rules are enforced in the database (`supabase/migrations/015_unanimous_voting.sql`):
server actions call functions that only the service role can run, and
triggers keep the record append-only. `src/lib/rules.ts` holds the shared
labels and calculations.

## Development

```bash
cp .env.local.example .env.local   # fill in Supabase, Resend and CRON_SECRET
npm install
npm run dev
```

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test          # unit tests (Node's built-in test runner)
npm run test:db   # applies every migration to a scratch local PostgreSQL
                  # database and runs the voting-engine tests
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
