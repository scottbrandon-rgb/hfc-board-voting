-- Extensions
create extension if not exists "pgcrypto";

-- Members of the board (chair + voting members)
create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('chair', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index members_email_lower_idx on public.members (lower(email));

-- Motions
create table public.motions (
  id uuid primary key default gen_random_uuid(),
  motion_number text unique not null,
  title text not null,
  description text not null,
  status text not null default 'draft' check (status in (
    'draft','open','moved','seconded','voting',
    'decided_passed','decided_failed','decided_deferred',
    'withdrawn','died_no_motion','died_no_second','ratified'
  )),
  created_by uuid not null references public.members(id),
  moved_by uuid references public.members(id),
  seconded_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  moved_at timestamptz,
  seconded_at timestamptz,
  voting_opened_at timestamptz,
  decided_at timestamptz,
  ratified_at timestamptz,
  ratified_by uuid references public.members(id),
  result text check (result is null or result in ('passed','failed','deferred','died')),
  motion_text_hash text
);

create index motions_status_idx on public.motions (status);
create index motions_created_by_idx on public.motions (created_by);
create index motions_decided_at_idx on public.motions (decided_at desc);

-- Attachments uploaded with a motion
create table public.motion_attachments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references public.motions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null,
  content_type text not null,
  file_hash text not null,
  uploaded_by uuid not null references public.members(id),
  uploaded_at timestamptz not null default now()
);

create index motion_attachments_motion_idx on public.motion_attachments (motion_id);

-- Votes
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references public.motions(id) on delete cascade,
  member_id uuid not null references public.members(id),
  vote text not null check (vote in ('aye','nay','abstain','defer','auto_abstain')),
  cast_at timestamptz not null default now(),
  motion_hash_at_vote text not null,
  ip_address inet,
  user_agent text,
  unique (motion_id, member_id)
);

create index votes_motion_idx on public.votes (motion_id);

-- Comments / discussion thread
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references public.motions(id) on delete cascade,
  member_id uuid not null references public.members(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_motion_idx on public.comments (motion_id);

-- Audit log (append-only)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid references public.motions(id),
  member_id uuid references public.members(id),
  event_type text not null,
  event_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_motion_idx on public.audit_log (motion_id);
create index audit_log_event_type_idx on public.audit_log (event_type);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
