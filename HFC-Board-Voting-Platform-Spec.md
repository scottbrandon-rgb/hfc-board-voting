# HFC Board Voting Platform

## 1. Project Goal

Build a mobile-first web application that lets the Harrison Faith Church Board of Directors deliberate and provisionally vote on motions between in-person sessions. **All electronic actions are non-binding and serve only to expedite the next in-person meeting, where each motion is formally ratified.** Every generated record is stamped "Provisional, subject to ratification" until a secretary marks it ratified.

## 2. Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend / Auth / DB / Storage**: Supabase (Postgres, Row Level Security, Auth, Storage)
- **Auth method**: Magic link (passwordless email)
- **Email**: Resend (transactional) via Next.js API routes
- **PDF generation**: `@react-pdf/renderer` server-side
- **Notion sync**: Notion API (`@notionhq/client`)
- **Hosting**: Netlify
- **Design**: Mobile-first, accessible, optimized for one-handed phone use

## 3. Roles

| Role | Count | Capabilities |
|---|---|---|
| Chair | 1 | Create motions, open voting after a second, break ties, view all data |
| Voting Member | 5 | Make a motion, second a motion, vote, comment, attach files |
| Secretary | 1 (can overlap with chair or member) | Mark motions as ratified after in-person session |

The chair does **not** vote unless a tie exists between Aye and Nay among the 5 voting members.

## 4. Voting Options

Members choose one of:

- **Aye** (count toward tally)
- **Nay** (count toward tally)
- **Abstain** (does not count toward tally, per Robert's Rules)
- **Move to in-person** (deferral vote)

## 5. Decision Rules

- A simple majority of Aye vs Nay decides the motion.
- **A single "Move to in-person" vote from any member immediately defers the motion** to the next in-person session. No further votes are tallied once a deferral is cast.
- A tie between Aye and Nay (with no deferral votes) prompts the chair to cast a tiebreaker.
- Members have **48 hours** from voting opening to cast a vote. A reminder email sends at the 24 hour mark. At 48 hours the system records an automatic Abstain on behalf of the silent member and finalizes the result.

## 6. Motion State Machine

```
draft
  └─→ open                       (chair publishes)
        ├─→ moved                (any member moves)
        │     ├─→ seconded       (any other member seconds)
        │     │     ├─→ voting   (chair opens voting)
        │     │     │     ├─→ decided_passed
        │     │     │     ├─→ decided_failed
        │     │     │     └─→ decided_deferred   (any "Move to in-person" vote)
        │     │     └─→ withdrawn       (mover withdraws before voting)
        │     └─→ died_no_second        (timeout with no second)
        └─→ died_no_motion              (timeout with no mover)
        
decided_*  ──→ ratified           (secretary action after in-person session)
```

Timeouts:

- **No motion within 72 hours of publishing** → status becomes `died_no_motion`
- **No second within 48 hours of being moved** → status becomes `died_no_second`
- **Voting open for 48 hours** → silent members auto-abstain, motion finalizes

## 7. Data Model (Supabase / Postgres)

```sql
-- Members of the board
create table members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('chair', 'member', 'secretary')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Motions
create table motions (
  id uuid primary key default gen_random_uuid(),
  motion_number text unique not null,           -- e.g. HFC-2026-014
  title text not null,
  description text not null,
  status text not null default 'draft',         -- see state machine
  created_by uuid not null references members(id),
  moved_by uuid references members(id),
  seconded_by uuid references members(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  moved_at timestamptz,
  seconded_at timestamptz,
  voting_opened_at timestamptz,
  decided_at timestamptz,
  ratified_at timestamptz,
  ratified_by uuid references members(id),
  result text,                                  -- passed | failed | deferred | died
  motion_text_hash text                         -- sha-256 of title+description+attachment hashes
);

-- Attachments uploaded with a motion
create table motion_attachments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references motions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null,
  content_type text not null,
  file_hash text not null,                      -- sha-256 of file
  uploaded_by uuid not null references members(id),
  uploaded_at timestamptz not null default now()
);

-- Votes
create table votes (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references motions(id) on delete cascade,
  member_id uuid not null references members(id),
  vote text not null check (vote in ('aye', 'nay', 'abstain', 'defer', 'auto_abstain')),
  cast_at timestamptz not null default now(),
  motion_hash_at_vote text not null,            -- snapshot hash for integrity
  ip_address inet,
  user_agent text,
  unique (motion_id, member_id)
);

-- Comments / discussion
create table comments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references motions(id) on delete cascade,
  member_id uuid not null references members(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Audit log (append-only)
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid references motions(id),
  member_id uuid references members(id),
  event_type text not null,                     -- e.g. published, moved, seconded, voted, commented, ratified
  event_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
```

Apply Row Level Security on every table. Only authenticated members may read motion data. Only the chair may insert motions or transition to `voting`. Only the mover may withdraw their own motion. Only the secretary may set `ratified`.

## 8. Authentication

- Supabase Magic Link via email.
- A user can only authenticate if their email exists in the `members` table with `is_active = true`.
- Use a custom Supabase Auth hook or pre-sign-up trigger to enforce this allowlist.
- Session length: 30 days, refresh on activity.
- Log every login event to `audit_log`.

## 9. Integrity Hashing

When voting opens, compute and store on the motion record:

```
motion_text_hash = sha256(
  title + "\n" +
  description + "\n" +
  sorted_concat(attachment.file_hash for each attachment)
)
```

Each vote record stores `motion_hash_at_vote`, copied from the motion at the moment the vote is cast. The PDF embeds these hashes in metadata so any later edit to the motion text or attachments can be detected.

## 10. Screens

All screens responsive, mobile-first (375px baseline), tap targets 44px minimum.

1. **Login** – email entry, magic link sent confirmation
2. **Dashboard** – three sections: Active (needs my action), In Progress (awaiting others), Recent (last 30 days)
3. **Motion Detail** – adapts to motion status and viewer role:
   - Chair sees: edit (if draft), publish, open voting (if seconded), tiebreaker (if tied), ratify (if secretary)
   - Members see: move, second, vote, comment, attach buttons as eligible
   - All see: full history timeline of actions, comment thread, attachments, current vote tally (visible after their own vote)
4. **Create Motion** (chair only) – title, description (rich text basic), attachments, save as draft or publish
5. **Tiebreaker View** (chair only) – motion summary, current tally, Aye/Nay buttons
6. **Archive** – searchable list of all decided and ratified motions, filter by status, year, voter
7. **Profile** – name, email, notification preferences

### UX rules

- Vote tallies are **hidden** from a member until that member has cast their own vote, to prevent influence.
- Comments are visible at all times.
- The chair sees the running tally during voting.
- Every state transition triggers an in-app toast and an email.

## 11. Email Notifications (via Resend)

| Event | Recipients |
|---|---|
| Motion published | All voting members |
| Motion moved | All voting members + chair |
| Motion seconded | Chair |
| Voting opened | All voting members |
| 24-hour vote reminder | Members who have not yet voted |
| Voting closed / decided | All members + chair |
| Tie requires chair vote | Chair |
| Motion deferred | All members + chair |
| New comment posted | All who have engaged with the motion (configurable) |
| Ratified at in-person | All members + chair |

Each email includes a deep link to the motion detail page (which itself triggers a magic link if the user is signed out).

## 12. PDF Format

Generate on transition to any `decided_*` state, regenerate on ratification.

```
HARRISON FAITH CHURCH
Board of Directors

PROVISIONAL MOTION RECORD
Subject to ratification at the next regular session

Motion No.:        HFC-2026-014
Date Opened:       April 27, 2026, 2:14 PM CT
Date Decided:      April 28, 2026, 9:02 AM CT

TITLE
[Motion title]

DESCRIPTION
[Full description, preserving line breaks]

ATTACHMENTS
- quote-bus-bluebird.pdf  (sha256: 4f3a...)
- vendor-comparison.pdf   (sha256: a812...)

MOTION ACTIVITY
Moved by:          [Name] ([timestamp])
Seconded by:       [Name] ([timestamp])
Voting opened by:  Scott Brandon, Chairman ([timestamp])

DISCUSSION
[Author, timestamp]
[Comment body]

[Author, timestamp]
[Comment body]

VOTE
[Name]                  Aye           [timestamp]
[Name]                  Nay           [timestamp]
[Name]                  Abstain       [timestamp]
[Name]                  Move to in-person   [timestamp]
[Name]                  Auto-abstain  [timestamp, "no response within 48 hours"]
Scott Brandon (Chair)   [Did not vote (no tie) | Aye/Nay tiebreaker]

RESULT: PASSED | FAILED | DEFERRED TO IN-PERSON SESSION
Tally: [X] Aye, [Y] Nay, [Z] Abstain, [W] Defer

STATUS: PROVISIONAL

This electronic action is non-binding and serves only to expedite
deliberation. Final adoption requires ratification by the Board of
Directors at the next regular in-person session, per HFC Constitution
and Bylaws.

RATIFICATION BLOCK

Ratified at the regular session of: ______________________

Secretary signature: __________________________________
```

PDF metadata (not visible on page) includes:

- `motion_id`
- `motion_text_hash`
- Per-vote `{member_id, vote, cast_at, motion_hash_at_vote}` array
- Generation timestamp

Footer on every page: `Motion HFC-2026-014 · Page X of Y · Generated [timestamp]`

## 13. Notion Integration

On ratification (secretary clicks Ratify):

1. Create a record in the **HFC Board Motions** Notion database.
2. Map fields:
   - Title → motion title
   - Motion Number → `HFC-YYYY-NNN`
   - Date → date_decided
   - Status → "Ratified"
   - Result → passed/failed/deferred
   - Moved By, Seconded By → relations to staff records if available, else text
   - Tally → "3 Aye, 1 Nay, 1 Abstain"
   - Description → full description
3. Upload the final PDF as a file property on the Notion record.
4. Store the returned Notion page ID on the motion record for future reference.

The Notion database ID will be supplied via environment variable. **Note for setup**: confirm with Scott which Notion database is the target (likely the HFC Board Motions database referenced in The Hub) and add it to `.env`.

## 14. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=board@harrisonfaith.org
NOTION_API_KEY=
NOTION_BOARD_MOTIONS_DB_ID=
APP_URL=https://board.harrisonfaith.org
TIMEZONE=America/Chicago
```

## 15. Background Jobs

Use Supabase scheduled functions or Netlify scheduled functions running every 15 minutes to:

- Detect timeout transitions (`died_no_motion`, `died_no_second`, voting close)
- Send 24-hour vote reminders
- Finalize motions with auto-abstains at the 48-hour mark

## 16. Build Sequence (work in this order)

1. **Repo bootstrap**: Next.js + TypeScript + Tailwind + shadcn/ui + ESLint + Prettier
2. **Supabase project**: schema migration, RLS policies, seed script for initial members
3. **Magic link auth flow**: login page, allowlist enforcement, session middleware
4. **Member dashboard skeleton**: empty states, navigation, profile menu
5. **Chair create-motion flow**: form, attachments to Supabase Storage, draft and publish
6. **Member motion-detail screen**: move and second actions, comments
7. **Voting flow**: open voting (chair), cast vote (member), hide tally pre-vote
8. **State machine engine**: transitions, validations, audit log writes
9. **Tiebreaker flow**: chair-only vote when Aye = Nay
10. **Deferral logic**: any defer vote ends voting and marks `decided_deferred`
11. **Background jobs**: timeouts, reminders, auto-abstains
12. **Email notifications**: Resend integration, all event types
13. **PDF generation**: `@react-pdf/renderer`, store in Supabase Storage on decision
14. **Archive screen**: search, filter, download PDFs
15. **Ratification flow**: secretary action, regenerate PDF with ratification block filled
16. **Notion integration**: push ratified motions to The Hub
17. **Mobile polish pass**: tap targets, keyboard handling, offline messaging
18. **Hardening**: rate limiting, audit log review screen, integrity hash verification utility
19. **Deploy to Netlify**, point `board.harrisonfaith.org` at it
20. **Acceptance test**: Scott runs an end-to-end mock motion with himself in all roles before inviting the board

## 17. Out of Scope (v1)

- Real-time presence or live updates (use polling or page refresh)
- Push notifications (email is the channel)
- Two-factor auth beyond magic link
- Multi-board / multi-tenant support
- Roberts Rules procedural motions beyond simple deferral

## 18. Acceptance Criteria

- A member can sign in via magic link from a phone in under 30 seconds.
- The chair can publish a motion, see it move through all states, and download a clean PDF.
- A motion with one defer vote ends immediately as `decided_deferred`.
- A 2-2 tie among voting members triggers a chair tiebreaker prompt.
- A member who never votes is recorded as `auto_abstain` after 48 hours.
- A ratified motion appears in the HFC Board Motions Notion database with the PDF attached.
- The motion text hash on every vote matches the motion text hash at decision time.

## 19. Open Items for Scott

Before development starts, confirm:

- The five voting member names and email addresses (for the seed script).
- Whether a separate secretary role is needed, or whether the chair handles ratification.
- The Notion database ID for HFC Board Motions in The Hub.
- The exact subdomain for hosting (suggested: `board.harrisonfaith.org`).
- Whether attachments should be limited in size or type (suggested cap: 25 MB per file, common doc and image types only).
