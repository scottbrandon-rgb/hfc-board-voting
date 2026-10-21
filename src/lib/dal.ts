import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { escapeLike } from '@/lib/utils';
import type { Role } from '@/lib/rules';

export type CurrentMember = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
};

const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { user: null, member: null };

  const { data: member } = await supabase
    .from('members')
    .select('id, email, full_name, role')
    .ilike('email', escapeLike(user.email))
    .eq('is_active', true)
    .maybeSingle();

  return { user, member: (member as CurrentMember | null) ?? null };
});

export async function getCurrentMember(): Promise<CurrentMember | null> {
  return (await getSession()).member;
}

/**
 * The signed-in, active board member. Someone signed in whose membership was
 * retired is signed out (rather than bounced between pages) and told why.
 */
export async function requireMember(): Promise<CurrentMember> {
  const { user, member } = await getSession();
  if (!user) redirect('/login');
  if (!member) redirect('/auth/inactive');
  return member;
}

export async function requireChair(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== 'chair') redirect('/');
  return member;
}

/** Chair or secretary: meeting records and the official PDF. */
export async function requireChairOrSecretary(): Promise<CurrentMember> {
  const member = await requireMember();
  if (member.role !== 'chair' && member.role !== 'secretary') redirect('/');
  return member;
}

/** IP address and browser, recorded with every action in the audit log. */
export async function requestContext(): Promise<{
  p_ip: string | null;
  p_user_agent: string | null;
}> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { p_ip: ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null, p_user_agent: h.get('user-agent') };
}

/**
 * The voting functions raise plain-language messages for rule violations
 * (Postgres error code P0001); anything else is unexpected and logged.
 */
export function friendlyError(
  error: { code?: string; message: string } | null | undefined,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!error) return fallback;
  if (error.code === 'P0001') return error.message;
  console.error('[action] unexpected error:', error);
  return fallback;
}
