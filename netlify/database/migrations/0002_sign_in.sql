-- 0002_sign_in.sql
--
-- Sign-in, replacing Supabase Auth. Members sign in the same way as before:
-- they enter their email, get an 8-digit code by email, and type it in.
--
--   login_codes  one row per code sent. Only a hash of the code is stored.
--                A code works once, for one hour, and allows five tries;
--                sending a new code cancels the older ones.
--   sessions     one row per signed-in device. The browser holds a random
--                token in a cookie; only its hash is stored here, so a copy of
--                the database cannot be used to sign in.
--
-- The rules (lifetimes, limits) live in src/lib/auth.ts.

create table if not exists public.login_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz
);

create index if not exists login_codes_member_created_idx
  on public.login_codes (member_id, created_at desc);

create table if not exists public.sessions (
  token_hash text primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);

create index if not exists sessions_member_idx on public.sessions (member_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);
