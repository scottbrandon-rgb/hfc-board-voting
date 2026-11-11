'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireChair, friendlyError } from '@/lib/dal';
import { attempt, audit as record, query, queryOne, rpc } from '@/lib/db';
import { endAllSessions } from '@/lib/session';
import { notifyWelcome } from '@/lib/notify';

export type MemberActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

const ROLES = ['member', 'secretary', 'chair'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function audit(
  memberId: string,
  actorId: string,
  event: string,
  data: Record<string, unknown>,
) {
  await record({
    member_id: actorId,
    event_type: event,
    event_data: { target_member_id: memberId, ...data },
  });
}

function refresh() {
  revalidatePath('/admin/members');
  revalidatePath('/');
}

export async function addMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const chair = await requireChair();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? 'member');

  if (!fullName) return { status: 'error', message: 'Enter their full name.' };
  if (fullName.length > 80)
    return { status: 'error', message: 'Keep the name under 80 characters.' };
  if (!EMAIL.test(email)) return { status: 'error', message: 'Enter a valid email address.' };
  if (role !== 'member' && role !== 'secretary') {
    return { status: 'error', message: 'New members join as a member or secretary.' };
  }

  const existing = await queryOne('select id from public.members where lower(email) = $1', [email]);
  if (existing)
    return { status: 'error', message: 'Someone with that email is already on the board list.' };

  const { data: created, error } = await attempt(() =>
    queryOne<{ id: string }>(
      `insert into public.members (full_name, email, role, is_active)
       values ($1, $2, $3, true) returning id`,
      [fullName, email, role],
    ),
  );
  if (error || !created) return { status: 'error', message: friendlyError(error) };

  await audit(created.id, chair.id, 'member_added', { email, role });
  after(() => notifyWelcome(email, fullName));
  refresh();
  return { status: 'success', message: `${fullName} added. We've emailed them how to sign in.` };
}

export async function updateMemberRole(
  memberId: string,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const chair = await requireChair();
  const role = String(formData.get('role') ?? '');
  if (!(ROLES as readonly string[]).includes(role))
    return { status: 'error', message: 'Choose a role.' };
  if (memberId === chair.id) {
    return { status: 'error', message: 'To step down as chair, make another member the chair.' };
  }

  const target = await queryOne<{
    id: string;
    full_name: string;
    role: string;
    is_active: boolean;
  }>('select id, full_name, role, is_active from public.members where id = $1', [memberId]);
  if (!target) return { status: 'error', message: 'Member not found.' };
  if (target.role === role) return { status: 'success', message: 'No change.' };

  if (role === 'chair') {
    if (!target.is_active) return { status: 'error', message: 'Reactivate this member first.' };
    const { error } = await rpc('admin_transfer_chair', {
      p_from_member_id: chair.id,
      p_to_member_id: memberId,
    });
    if (error) return { status: 'error', message: friendlyError(error) };
    refresh();
    revalidatePath('/', 'layout');
    return {
      status: 'success',
      message: `${target.full_name} is now the chair. You are now a voting member.`,
    };
  }

  const { error } = await attempt(() =>
    query('update public.members set role = $2 where id = $1', [memberId, role]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };
  await audit(memberId, chair.id, 'member_role_changed', { from: target.role, to: role });
  refresh();
  return { status: 'success', message: 'Role updated.' };
}

export async function updateMemberEmail(
  memberId: string,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const chair = await requireChair();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { status: 'error', message: 'Enter a valid email address.' };

  const target = await queryOne<{ id: string; email: string }>(
    'select id, email from public.members where id = $1',
    [memberId],
  );
  if (!target) return { status: 'error', message: 'Member not found.' };
  if (target.email.toLowerCase() === email) return { status: 'success', message: 'No change.' };

  const clash = await queryOne(
    'select id from public.members where lower(email) = $1 and id <> $2',
    [email, memberId],
  );
  if (clash) return { status: 'error', message: 'Another member already uses that email.' };

  const { error } = await attempt(() =>
    query('update public.members set email = $2 where id = $1', [memberId, email]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };

  // Signed in under the old address: sign them out everywhere.
  await endAllSessions(memberId);
  await audit(memberId, chair.id, 'member_email_changed', { from: target.email, to: email });
  refresh();
  return {
    status: 'success',
    message: 'Email updated. They sign in with the new address from now on.',
  };
}

/** Retire (or reactivate) a member. Members are never deleted: their votes stay on record. */
export async function setMemberActive(
  memberId: string,
  active: boolean,
): Promise<MemberActionState> {
  const chair = await requireChair();
  if (memberId === chair.id) return { status: 'error', message: 'You cannot retire yourself.' };

  const target = await queryOne<{
    id: string;
    full_name: string;
    role: string;
    is_active: boolean;
  }>('select id, full_name, role, is_active from public.members where id = $1', [memberId]);
  if (!target) return { status: 'error', message: 'Member not found.' };
  if (target.role === 'chair')
    return { status: 'error', message: 'Make someone else the chair first.' };
  if (target.is_active === active) return { status: 'success', message: 'No change.' };

  const { error } = await attempt(() =>
    query('update public.members set is_active = $2 where id = $1', [memberId, active]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };
  if (!active) await endAllSessions(memberId);
  await audit(memberId, chair.id, active ? 'member_reactivated' : 'member_retired', {});
  refresh();
  return {
    status: 'success',
    message: active
      ? `${target.full_name} is active again.`
      : `${target.full_name} has been retired.`,
  };
}
