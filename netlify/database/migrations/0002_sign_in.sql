-- Sign-in for board members, replacing Supabase Auth.
--
-- A member asks for a code; the app emails an 8-digit code (through Resend)
-- and stores only its SHA-256 hash here. A correct code starts a session: the
-- browser keeps a random token in an HTTP-only cookie and the database keeps
-- only the token's hash. Both tables are in the private schema, out of sight
-- of anything but the server.

create table private.sign_in_codes (
  email        text primary key,             -- lower-case board email
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,   -- wrong guesses for this code
  sent_at      timestamptz not null default now(),
  window_start timestamptz not null default now(),
  sends        integer not null default 1    -- codes sent since window_start
);

create table private.sessions (
  token_hash   text primary key,
  member_id    uuid not null references public.members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  ip_address   inet,
  user_agent   text
);

create index sessions_member_idx on private.sessions (member_id);
create index sessions_expires_idx on private.sessions (expires_at);
