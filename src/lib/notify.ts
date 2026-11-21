import 'server-only';
import { query, queryOne } from '@/lib/db';
import { APP_URL, motionUrl, render, sendEach, type Message } from '@/lib/email';
import { clip, formatDateTime } from '@/lib/format';
import { sendPush, type PushMessage } from '@/lib/push';
import { referralReasonLabel } from '@/lib/rules';

// Who gets which notice. Every notice is an email and a push notification to
// the same people (a member's push only reaches devices they turned push on
// for). Notices that ask a member to act on an open vote ignore preferences:
// under the unanimity rule a missed notice can send a motion to the in-person
// meeting.

type Pref = 'notify_new_motions' | 'notify_comments' | 'notify_results';

interface Recipient {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

/** Sends the email and the push notification for one notice. Neither throws. */
async function deliver(
  to: readonly Recipient[],
  email: Message,
  push: PushMessage,
  kind: string,
  motionId: string | null,
): Promise<void> {
  await Promise.all([
    sendEach(
      to.map((r) => r.email),
      email,
    ),
    sendPush(
      to.map((r) => r.id),
      push,
      { kind, motionId },
    ),
  ]);
}

/** `HFC-2026-004 · Title` — the second line of most push notifications. */
function line(m: { motion_number: string; title: string }): string {
  return clip(`${m.motion_number} · ${m.title}`);
}

function motionPath(motionId: string): string {
  return `/motions/${motionId}`;
}

async function activeMembers(): Promise<(Recipient & Record<Pref, boolean>)[]> {
  try {
    return await query<Recipient & Record<Pref, boolean>>(
      `select id, email, full_name, role, notify_new_motions, notify_comments, notify_results
         from public.members where is_active`,
    );
  } catch (err) {
    console.error('[notify] could not load members:', err);
    return [];
  }
}

interface NotifyMotion {
  id: string;
  motion_number: string;
  title: string;
  status: string;
  moved_by: string | null;
  voting_deadline: string | null;
  electorate_size: number | null;
  referral_reason: string | null;
  referral_note: string | null;
  referred_by: string | null;
  deadline_extension_note: string | null;
}

async function loadMotion(motionId: string): Promise<NotifyMotion | null> {
  return queryOne<NotifyMotion>(
    `select id, motion_number, title, status, moved_by, voting_deadline, electorate_size,
            referral_reason, referral_note, referred_by, deadline_extension_note
       from public.motions where id = $1`,
    [motionId],
  );
}

async function electorateIds(motionId: string): Promise<string[]> {
  const rows = await query<{ member_id: string }>(
    'select member_id from public.motion_electorate where motion_id = $1',
    [motionId],
  );
  return rows.map((r) => r.member_id);
}

async function electorateNonVoters(motionId: string): Promise<Recipient[]> {
  const [electorate, votes, members] = await Promise.all([
    electorateIds(motionId),
    query<{ member_id: string }>('select member_id from public.votes where motion_id = $1', [
      motionId,
    ]),
    activeMembers(),
  ]);
  const voted = new Set(votes.map((v) => v.member_id));
  const ids = new Set(electorate.filter((id) => !voted.has(id)));
  return members.filter((m) => ids.has(m.id));
}

async function electorateMembers(motionId: string): Promise<Recipient[]> {
  const [electorate, members] = await Promise.all([electorateIds(motionId), activeMembers()]);
  const ids = new Set(electorate);
  return members.filter((m) => ids.has(m.id));
}

function deadlineText(iso: string | null): string {
  return iso ? `${formatDateTime(iso)} (Central)` : 'the deadline';
}

// ─── Motion lifecycle ────────────────────────────────────────────────────────

export async function notifyPublished(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.role !== 'chair' && r.notify_new_motions);
  await deliver(
    to,
    {
      subject: `New motion: ${m.title}`,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [
          'The chair has published a new motion. It needs one member to move it and another to second it. Voting opens as soon as it is seconded.',
        ],
        button: { href: motionUrl(m.id), label: 'Read the motion' },
      }),
    },
    {
      title: 'New motion to review',
      body: line(m),
      url: motionPath(m.id),
      tag: `published-${m.id}`,
    },
    'published',
    m.id,
  );
}

/**
 * A member moved the motion: it now needs a second. Push only (no email goes
 * out when a member moves). Voting members other than the mover are told, and
 * preferences are ignored because a second is what opens voting.
 */
export async function notifyMoved(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'moved') return;
  const members = await activeMembers();
  const mover = members.find((r) => r.id === m.moved_by);
  const to = members.filter(
    (r) => (r.role === 'member' || r.role === 'secretary') && r.id !== m.moved_by,
  );
  await sendPush(
    to.map((r) => r.id),
    {
      title: 'A motion needs a second',
      body: clip(`${mover?.full_name ?? 'A member'} moved ${m.motion_number} · ${m.title}`),
      url: motionPath(m.id),
      tag: `call-${m.id}`,
    },
    { kind: 'moved', motionId: m.id },
  );
}

/** The chair's call for a motion, call for a second, or reminder to vote. */
export async function notifyCall(motionId: string, status: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();

  if (status === 'open' || status === 'moved') {
    const mover = members.find((r) => r.id === m.moved_by);
    const to = members.filter(
      (r) => (r.role === 'member' || r.role === 'secretary') && r.id !== m.moved_by,
    );
    await deliver(
      to,
      {
        subject:
          status === 'open' ? `Call for a motion: ${m.title}` : `Call for a second: ${m.title}`,
        ...render({
          eyebrow: m.motion_number,
          title: m.title,
          paragraphs: [
            status === 'open'
              ? 'The chair is asking whether a member will move this motion.'
              : `${mover?.full_name ?? 'A member'} moved this motion. It needs a second before voting opens.`,
          ],
          button: { href: motionUrl(m.id), label: 'Open the motion' },
        }),
      },
      {
        title: status === 'open' ? 'Call for a motion' : 'Call for a second',
        body: line(m),
        url: motionPath(m.id),
        tag: `call-${m.id}`,
      },
      status === 'open' ? 'call_for_motion' : 'call_for_second',
      m.id,
    );
    return;
  }

  if (status === 'voting') {
    await notifyReminder(motionId, 'chair');
  }
}

export async function notifyVotingOpened(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'voting') return;
  const to = await electorateMembers(motionId);
  await deliver(
    to,
    {
      subject: `Your vote is needed: ${m.title}`,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [
          `Voting is open. The motion is approved when all ${m.electorate_size ?? 5} voting members vote Aye. If you have a question, a concern or a conflict, choose Discuss in person and it goes to the in-person meeting.`,
          `Voting closes ${deadlineText(m.voting_deadline)}. You can change your vote until then.`,
        ],
        button: { href: motionUrl(m.id), label: 'Review and vote' },
      }),
    },
    {
      title: 'Your vote is needed',
      body: line(m),
      url: motionPath(m.id),
      tag: `vote-${m.id}`,
    },
    'voting_opened',
    m.id,
  );
}

export async function notifyReminder(
  motionId: string,
  kind: '24h' | 'final' | 'chair',
): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'voting') return;
  const to = await electorateNonVoters(motionId);
  const subject =
    kind === 'final'
      ? `Last call — voting closes soon: ${m.title}`
      : `Reminder — your vote is needed: ${m.title}`;
  await deliver(
    to,
    {
      subject,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [
          `You haven't voted yet. Voting closes ${deadlineText(m.voting_deadline)}.`,
          'If every member has not voted Aye by then, the motion goes to the in-person meeting.',
        ],
        button: { href: motionUrl(m.id), label: 'Review and vote' },
      }),
    },
    {
      title: kind === 'final' ? 'Last call: voting closes soon' : 'Reminder: your vote is needed',
      body: line(m),
      url: motionPath(m.id),
      tag: `vote-${m.id}`,
    },
    kind === 'final' ? 'reminder_final' : kind === '24h' ? 'reminder_24h' : 'reminder_chair',
    m.id,
  );
}

export async function notifyExtended(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'voting') return;
  const to = await electorateMembers(motionId);
  await deliver(
    to,
    {
      subject: `Deadline extended: ${m.title}`,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [
          `The chair extended voting. It now closes ${deadlineText(m.voting_deadline)}.`,
        ],
        quote: m.deadline_extension_note
          ? { text: m.deadline_extension_note, by: 'The chair' }
          : undefined,
        button: { href: motionUrl(m.id), label: 'Open the motion' },
      }),
    },
    {
      title: 'Voting deadline extended',
      body: clip(`${m.motion_number} closes ${deadlineText(m.voting_deadline)}`),
      url: motionPath(m.id),
      tag: `vote-${m.id}`,
    },
    'extended',
    m.id,
  );
}

/** Approved or referred. */
export async function notifyOutcome(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.notify_results);

  if (m.status === 'approved') {
    await deliver(
      to,
      {
        subject: `Approved: ${m.title}`,
        ...render({
          eyebrow: m.motion_number,
          title: m.title,
          paragraphs: [
            `All ${m.electorate_size ? `${m.electorate_size} ` : ''}voting members voted Aye. The motion is approved and will be ratified at the next in-person meeting.`,
          ],
          button: { href: motionUrl(m.id), label: 'See the votes' },
        }),
      },
      {
        title: 'Motion approved',
        body: line(m),
        url: motionPath(m.id),
        tag: `outcome-${m.id}`,
      },
      'approved',
      m.id,
    );
    return;
  }

  if (m.status === 'referred') {
    await deliver(
      to,
      {
        subject: `Referred to the meeting: ${m.title}`,
        ...render({
          eyebrow: m.motion_number,
          title: m.title,
          paragraphs: [
            `${referralReasonLabel(m.referral_reason)}, so this motion goes to the next in-person meeting.`,
          ],
          quote: m.referral_note ? { text: m.referral_note, by: 'The chair' } : undefined,
          button: { href: motionUrl(m.id), label: 'See the votes' },
        }),
      },
      {
        title: 'Motion referred to the meeting',
        body: line(m),
        url: motionPath(m.id),
        tag: `outcome-${m.id}`,
      },
      'referred',
      m.id,
    );
  }
}

export async function notifyRatified(motionIds: readonly string[]): Promise<void> {
  if (motionIds.length === 0) return;
  const motions = await query<{ id: string; motion_number: string; title: string }>(
    'select id, motion_number, title from public.motions where id = any($1::uuid[])',
    [[...motionIds]],
  );
  if (!motions.length) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.notify_results);
  const list = motions.map((m) => `${m.motion_number} — ${m.title}`);
  const single = motions.length === 1 ? motions[0] : null;
  await deliver(
    to,
    {
      subject: single ? `Ratified: ${single.title}` : `${motions.length} motions ratified`,
      ...render({
        title: single ? single.title : `${motions.length} motions ratified`,
        paragraphs: ['Ratified at the in-person meeting:', ...list],
        button: { href: `${APP_URL}/motions?filter=approved`, label: 'View motions' },
      }),
    },
    {
      title: single ? 'Motion ratified' : `${motions.length} motions ratified`,
      body: single ? line(single) : clip(list.join('; ')),
      url: single ? motionPath(single.id) : '/motions?filter=approved',
    },
    'ratified',
    single?.id ?? null,
  );
}

export async function notifyComment(
  motionId: string,
  authorId: string,
  body: string,
): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();
  const author = members.find((r) => r.id === authorId);
  const to = members.filter((r) => r.notify_comments && r.id !== authorId);
  const excerpt = body.length > 400 ? `${body.slice(0, 400)}…` : body;
  await deliver(
    to,
    {
      subject: `New comment: ${m.title}`,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [],
        quote: { text: excerpt, by: author?.full_name },
        button: { href: `${motionUrl(m.id)}#discussion`, label: 'Read and reply' },
      }),
    },
    {
      // No comment text: a lock screen is not the place for board discussion.
      title: 'New comment',
      body: clip(`${author?.full_name ?? 'A member'} commented on ${m.motion_number} · ${m.title}`),
      url: `${motionPath(m.id)}#discussion`,
    },
    'comment',
    m.id,
  );
}

export async function notifyWelcome(email: string, fullName: string): Promise<void> {
  await sendEach([email], {
    subject: 'Welcome to the Harrison Faith Deacon Board site',
    ...render({
      title: `Welcome, ${fullName.split(' ')[0]}`,
      paragraphs: [
        'You have been added to the Deacon Board site, where the board reviews motions and votes between meetings.',
        'To sign in, enter this email address and type the 8-digit code we send you. There is no password.',
      ],
      button: { href: `${APP_URL}/login`, label: 'Sign in' },
    }),
  });
}
