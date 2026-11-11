import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import type { Role } from '@/lib/rules';

export type CurrentMember = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
};

// One session lookup per request, however many components ask.
const getSession = cache(async () => {
  const session = await readSession();
  if (!session) return { signedIn: false, member: null };
  if (!session.is_active) return { signedIn: true, member: null };
  const { id, email, full_name, role } = session;
  return { signedIn: true, member: { id, email, full_name, role: role as Role } };
});

export async function getCurrentMember(): Promise<CurrentMember | null> {
  return (await getSession()).member;
}

/**
 * The signed-in, active board member. A missing or expired session goes to
 * sign-in (clearing the stale cookie); someone whose membership was retired is
 * signed out and told why.
 */
export async function requireMember(): Promise<CurrentMember> {
  const { signedIn, member } = await getSession();
  if (!signedIn) redirect('/auth/expired');
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

/** Chair and secretary see drafts; members see a motion once it is published. */
export function seesDrafts(member: CurrentMember): boolean {
  return member.role === 'chair' || member.role === 'secretary';
}

/** IP address and browser, recorded with every action in the audit log. */
export async function requestContext(): Promise<{
  p_ip: string | null;
  p_user_agent: string | null;
}> {
  const h = await headers();
  const ip =
    h.get('x-nf-client-connection-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null;
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
