import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type CurrentMember = {
  id: string;
  email: string;
  full_name: string;
  role: 'chair' | 'secretary' | 'member';
};

export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: member } = await supabase
    .from('members')
    .select('id, email, full_name, role')
    .ilike('email', user.email)
    .eq('is_active', true)
    .maybeSingle();

  if (!member) return null;
  return member as CurrentMember;
});

export async function requireMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  return member;
}

export async function requireChair(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== 'chair') redirect('/');
  return member;
}

/** Allows both chair and secretary — for read/download actions. */
export async function requireChairOrSecretary(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== 'chair' && member.role !== 'secretary') redirect('/');
  return member;
}
