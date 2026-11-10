'use server';

import { revalidatePath } from 'next/cache';
import { requireMember, friendlyError } from '@/lib/dal';
import { attempt, audit, query } from '@/lib/db';

export type ProfileState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

export async function updateDisplayName(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const member = await requireMember();
  const name = String(formData.get('full_name') ?? '').trim();
  if (!name) return { status: 'error', message: 'Enter your name.' };
  if (name.length > 80) return { status: 'error', message: 'Keep your name under 80 characters.' };

  const { error } = await attempt(() =>
    query('update public.members set full_name = $2 where id = $1', [member.id, name]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };
  await audit({
    member_id: member.id,
    event_type: 'member_name_changed',
    event_data: { from: member.full_name, to: name },
  });

  revalidatePath('/', 'layout');
  return { status: 'success' };
}

const PREFS = ['notify_new_motions', 'notify_comments', 'notify_results'] as const;
export type NotificationPref = (typeof PREFS)[number];
type Pref = NotificationPref;

export async function setNotificationPreference(
  pref: Pref,
  enabled: boolean,
): Promise<ProfileState> {
  const member = await requireMember();
  if (!PREFS.includes(pref)) return { status: 'error', message: 'Unknown setting.' };
  // `pref` is one of the three column names above, checked against PREFS.
  const { error } = await attempt(() =>
    query(`update public.members set ${pref} = $2 where id = $1`, [member.id, enabled]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };
  revalidatePath('/profile');
  return { status: 'success' };
}
