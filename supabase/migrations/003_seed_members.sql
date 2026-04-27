insert into public.members (email, full_name, role) values
  ('scottbrandon@harrisonfaith.org', 'Scott Brandon', 'chair'),
  ('Buster.Burns@mail.signature.bank', 'Buster Burns', 'member'),
  ('samwilson@harrisonfaith.org', 'Sam Wilson', 'member'),
  ('malcolmrd@hotmail.com', 'Malcolm Dove', 'member'),
  ('jyoungblood@harrisonfaith.org', 'Jeremy Youngblood', 'member'),
  ('trevorgibbins@harrisonfaith.org', 'Trevor Gibbins', 'member')
on conflict (email) do nothing;
