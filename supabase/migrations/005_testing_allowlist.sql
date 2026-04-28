-- Testing phase: only chair + test account should be able to authenticate.
-- Deactivate the 5 real voting members so the allowlist (is_active = true)
-- excludes them. They can be reactivated by setting is_active = true once
-- testing is complete.
update public.members
set is_active = false
where email in (
  'Buster.Burns@mail.signature.bank',
  'samwilson@harrisonfaith.org',
  'malcolmrd@hotmail.com',
  'jyoungblood@harrisonfaith.org',
  'trevorgibbins@harrisonfaith.org'
);

-- Add a test voting member for end-to-end flow testing.
insert into public.members (email, full_name, role, is_active)
values ('bigbodyscotty@gmail.com', 'Test', 'member', true)
on conflict (email) do update set is_active = true, full_name = excluded.full_name;
