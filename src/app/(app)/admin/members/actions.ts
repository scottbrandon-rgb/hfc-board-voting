'use server';

import { revalidatePath } from 'next/cache';
import { requireChair } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';

export type MemberActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

// ─── Add member ───────────────────────────────────────────────────────────────

export async function addMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  await requireChair();

  const fullName = (formData.get('full_name') as string | null)?.trim() ?? '';
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() ?? '';
  const role = formData.get('role') as string | null;
  if (!fullName) return { status: 'error', message: 'Full name is required.' };
  if (!email || !email.includes('@')) return { status: 'error', message: 'A valid email is required.' };
  if (!role || !['member', 'chair'].includes(role))
    return { status: 'error', message: 'Role must be member or chair.' };

  const admin = createAdminClient();

  // Guard: duplicate email
  const { data: existing } = await admin
    .from('members')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (existing) return { status: 'error', message: 'A member with that email already exists.' };

  const { error } = await admin.from('members').insert({
    full_name: fullName,
    email,
    role,
    is_active: true,
  });

  if (error) return { status: 'error', message: `Could not add member: ${error.message}` };

  revalidatePath('/admin/members');
  return { status: 'success' };
}

// ─── Toggle active ────────────────────────────────────────────────────────────

export async function toggleMemberActive(
  memberId: string,
  _prev: MemberActionState,
  _formData: FormData,
): Promise<MemberActionState> {
  const chair = await requireChair();

  if (memberId === chair.id)
    return { status: 'error', message: 'You cannot deactivate your own account.' };

  const admin = createAdminClient();

  const { data: target } = await admin
    .from('members')
    .select('id, is_active, role')
    .eq('id', memberId)
    .maybeSingle();

  if (!target) return { status: 'error', message: 'Member not found.' };

  // Guard: don't deactivate the last active chair
  if (target.role === 'chair' && target.is_active) {
    const { count } = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'chair')
      .eq('is_active', true);
    if ((count ?? 0) <= 1)
      return { status: 'error', message: 'Cannot deactivate the only active chair.' };
  }

  const { error } = await admin
    .from('members')
    .update({ is_active: !target.is_active })
    .eq('id', memberId);

  if (error) return { status: 'error', message: `Could not update member: ${error.message}` };

  revalidatePath('/admin/members');
  return { status: 'success' };
}

// ─── Update role ──────────────────────────────────────────────────────────────

export async function updateMemberRole(
  memberId: string,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const chair = await requireChair();

  if (memberId === chair.id)
    return { status: 'error', message: 'You cannot change your own role.' };

  const role = formData.get('role') as string | null;
  if (!role || !['member', 'chair'].includes(role))
    return { status: 'error', message: 'Invalid role.' };

  const admin = createAdminClient();

  const { data: target } = await admin
    .from('members')
    .select('id, role, is_active')
    .eq('id', memberId)
    .maybeSingle();

  if (!target) return { status: 'error', message: 'Member not found.' };

  // Guard: demoting a chair — ensure another active chair remains
  if (target.role === 'chair' && role === 'member' && target.is_active) {
    const { count } = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'chair')
      .eq('is_active', true);
    if ((count ?? 0) <= 1)
      return { status: 'error', message: 'Cannot demote the only active chair.' };
  }

  const { error } = await admin.from('members').update({ role }).eq('id', memberId);

  if (error) return { status: 'error', message: `Could not update role: ${error.message}` };

  revalidatePath('/admin/members');
  return { status: 'success' };
}
