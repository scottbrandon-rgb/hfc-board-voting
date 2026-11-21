import 'server-only';
import webpush from 'web-push';
import { audit, query } from '@/lib/db';
import { IS_PREVIEW } from '@/lib/email';

/**
 * Web push: the phone or computer shows a notification even when the board
 * site is closed. Every notice the site emails also goes out here (see
 * src/lib/notify.ts), to each device a member has turned push on for.
 *
 * Needs a VAPID key pair (`npx web-push generate-vapid-keys`) in
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Without them nothing is sent and the
 * Profile page does not offer the switch. Push never throws: a failed push must
 * not undo the action that caused it.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT =
  process.env.VAPID_SUBJECT ??
  `mailto:${process.env.RESEND_FROM_EMAIL ?? 'board@harrisonfaith.org'}`;

export const pushConfigured = !!PUBLIC_KEY && !!PRIVATE_KEY;

if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);

/** The public half of the key pair, for the browser to subscribe with. */
export function vapidPublicKey(): string | null {
  return pushConfigured ? PUBLIC_KEY! : null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path on the board site, e.g. /motions/<id>. */
  url: string;
  /** A later notice with the same tag replaces this one on the device. */
  tag?: string;
}

export interface PushContext {
  /** What this notice is, for the log: "call_for_motion", "outcome"… */
  kind: string;
  motionId?: string | null;
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  member_id: string;
}

const TTL_SECONDS = 24 * 60 * 60; // a notice that is a day late is no help

/** Sends to each subscription; returns how many were accepted. Dead ones are removed. */
async function deliver(subs: Subscription[], message: PushMessage): Promise<number> {
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  });
  const gone: string[] = [];
  let accepted = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: TTL_SECONDS, urgency: 'high' },
        );
        accepted += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or the browser dropped the address.
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error(`[push] "${message.title}" failed (${status ?? 'no status'}):`, err);
      }
    }),
  );

  if (gone.length) {
    await query('delete from private.push_subscriptions where endpoint = any($1::text[])', [
      gone,
    ]).catch((err) => console.error('[push] could not remove expired devices:', err));
  }
  return accepted;
}

/**
 * Pushes one notice to every device of the given members, and records that it
 * went out (server log, and a `push_sent` row in the audit log).
 */
export async function sendPush(
  memberIds: readonly string[],
  message: PushMessage,
  context: PushContext,
): Promise<void> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return;
  if (IS_PREVIEW) {
    console.log(`[push] preview deploy — not sending "${message.title}" to ${ids.length}`);
    return;
  }
  if (!pushConfigured) {
    console.log(`[push] VAPID keys not set — would send "${message.title}" to ${ids.length}`);
    return;
  }

  try {
    const subs = await query<Subscription>(
      `select endpoint, p256dh, auth, member_id
         from private.push_subscriptions where member_id = any($1::uuid[])`,
      [ids],
    );
    if (subs.length === 0) return;

    const members = new Set(subs.map((s) => s.member_id)).size;
    console.log(
      `[push] sending "${message.title}" (${context.kind}) to ${members} member(s), ${subs.length} device(s)`,
    );
    const delivered = await deliver(subs, message);

    await audit({
      motion_id: context.motionId ?? null,
      member_id: null,
      event_type: 'push_sent',
      event_data: {
        kind: context.kind,
        title: message.title,
        members,
        devices: subs.length,
        delivered,
      },
    });
  } catch (err) {
    console.error(`[push] "${message.title}" failed:`, err);
  }
}

/** The one-time "push is on" notice to the device a member just enabled. */
export async function sendPushConfirmation(sub: Subscription): Promise<void> {
  if (!pushConfigured || IS_PREVIEW) return;
  try {
    await deliver([sub], {
      title: 'Push notifications are on',
      body: 'This device will now tell you when the board needs you: motions, votes and results.',
      url: '/',
      tag: 'push-enabled',
    });
  } catch (err) {
    console.error('[push] confirmation failed:', err);
  }
}
