-- Vote participation visibility
--
-- Context: the motion page now shows *that* a member cast a vote (and who has
-- not yet voted) while voting is open, without showing the choice. Before this
-- migration the `votes_select` policy let any active board member read every
-- row of public.votes — including the `vote` column — directly from the REST
-- API with their own token. Ballot choices were hidden by the UI only.
--
-- Participation is now rendered server-side with the service role key, so no
-- member-facing read path through RLS is required. Tighten the policy to match:
-- a member reads their own ballot; chair and secretary keep full read access
-- for the official record (consistent with audit_log_privileged_select).

drop policy if exists votes_select on public.votes;

-- A member can always read their own ballot.
create policy votes_select_own on public.votes
  for select to authenticated
  using (member_id = private.current_member_id());

-- Chair and secretary read all ballots — they sign and file the record.
create policy votes_select_privileged on public.votes
  for select to authenticated
  using (private.current_member_role() in ('chair', 'secretary'));

-- Participation lookups filter by motion and order by cast time.
create index if not exists votes_motion_cast_at_idx
  on public.votes (motion_id, cast_at);
