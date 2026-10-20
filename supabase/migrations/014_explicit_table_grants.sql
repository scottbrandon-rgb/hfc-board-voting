-- Explicit Data API grants for public tables
--
-- Context: from 2026-10-30 Supabase no longer auto-grants Data API access to
-- new tables in the "public" schema. The live project keeps its existing
-- grants, but any rebuild of this schema (new project, preview branch,
-- `supabase db reset`) would leave these tables unreachable from supabase-js
-- with "permission denied". Grant explicitly so the migrations stand alone.
--
-- Least privilege, matched to the RLS policies:
--   - authenticated reads all six tables and inserts only where an insert
--     policy exists (votes, comments, motion_attachments). No UPDATE/DELETE
--     policies exist for members' own sessions, so those are not granted.
--   - service_role (server-side route handlers, cron) gets full DML. It
--     bypasses RLS but still needs table privileges.
--   - anon gets nothing — every policy is `to authenticated`.
--
-- GRANT is idempotent, so this is a no-op against the live project.

grant select on
  public.members,
  public.motions,
  public.motion_attachments,
  public.votes,
  public.comments,
  public.audit_log
to authenticated;

grant insert on
  public.motion_attachments,
  public.votes,
  public.comments
to authenticated;

grant select, insert, update, delete on
  public.members,
  public.motions,
  public.motion_attachments,
  public.votes,
  public.comments,
  public.audit_log
to service_role;
