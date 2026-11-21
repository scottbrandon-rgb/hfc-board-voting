'use server';

import { revalidatePath } from 'next/cache';
import { requireMember, friendlyError } from '@/lib/dal';
import { attempt, audit, query } from '@/lib/db';
import { pushConfigured, sendPushConfirmation } from '@/lib/push';
import { headers } from 'next/headers';

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

// ─── Push notifications on this device ───────────────────────────────────────

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function validSubscription(sub: PushSubscriptionInput): boolean {
  const { endpoint, keys } = sub ?? {};
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    if (new URL(endpoint).protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return (
    typeof keys?.p256dh === 'string' &&
    typeof keys?.auth === 'string' &&
    keys.p256dh.length <= 256 &&
    keys.auth.length <= 64
  );
}

/**
 * Saves this device's push address for the signed-in member. `announce` is
 * true when the member just switched push on (the device then gets a one-time
 * "push is on" notice); the quiet re-save when they revisit Profile is false.
 */
export async function savePushSubscription(
  sub: PushSubscriptionInput,
  announce: boolean,
): Promise<ProfileState> {
  const member = await requireMember();
  if (!pushConfigured) {
    return { status: 'error', message: 'Push notifications are not set up on this site yet.' };
  }
  if (!validSubscription(sub)) {
    return { status: 'error', message: 'This device sent an unusable push address. Try again.' };
  }
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;

  const { error } = await attempt(() =>
    query(
      `insert into private.push_subscriptions (endpoint, member_id, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth,
             user_agent = excluded.user_agent, updated_at = now()`,
      [sub.endpoint, member.id, sub.keys.p256dh, sub.keys.auth, userAgent],
    ),
  );
  if (error) return { status: 'error', message: friendlyError(error) };

  if (announce) {
    await sendPushConfirmation({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      member_id: member.id,
    });
  }
  return { status: 'success' };
}

export async function removePushSubscription(endpoint: string): Promise<ProfileState> {
  const member = await requireMember();
  if (typeof endpoint !== 'string') return { status: 'error', message: 'Unknown device.' };
  const { error } = await attempt(() =>
    query('delete from private.push_subscriptions where endpoint = $1 and member_id = $2', [
      endpoint,
      member.id,
    ]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };
  return { status: 'success' };
}
