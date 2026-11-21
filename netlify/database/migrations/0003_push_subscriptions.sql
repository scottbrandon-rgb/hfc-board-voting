-- Push notifications.
--
-- A member who turns on push on a phone or computer gives the browser's push
-- service an address (the endpoint) and two keys. The app stores them here and
-- uses them to send the same notices it emails. One member can have several
-- devices; an endpoint belongs to exactly one browser, so it is the key.
-- Private schema: only the server reads this table.

create table private.push_subscriptions (
  endpoint     text primary key,
  member_id    uuid not null references public.members(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index push_subscriptions_member_idx on private.push_subscriptions (member_id);
