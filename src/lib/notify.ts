import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_URL, motionUrl, render, sendEach } from '@/lib/email';
import { formatDateTime } from '@/lib/format';
import { referralReasonLabel } from '@/lib/rules';

// Who gets which email. Notices that ask a member to act on an open vote
// ignore preferences: under the unanimity rule a missed notice can send a
// motion to the in-person meeting.

type Pref = 'notify_new_motions' | 'notify_comments' | 'notify_results';

interface Recipient {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

async function activeMembers(): Promise<(Recipient & Record<Pref, boolean>)[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('members')
    .select('id, email, full_name, role, notify_new_motions, notify_comments, notify_results')
    .eq('is_active', true);
  if (error) {
    console.error('[notify] could not load members:', error.message);
    return [];
  }
  return data ?? [];
}

async function loadMotion(motionId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('motions')
    .select(
      'id, motion_number, title, status, moved_by, voting_deadline, electorate_size, referral_reason, referral_note, referred_by, deadline_extension_note',
    )
    .eq('id', motionId)
    .maybeSingle();
  return data;
}

async function electorateNonVoters(motionId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: electorate }, { data: votes }, members] = await Promise.all([
    admin.from('motion_electorate').select('member_id').eq('motion_id', motionId),
    admin.from('votes').select('member_id').eq('motion_id', motionId),
    activeMembers(),
  ]);
  const voted = new Set((votes ?? []).map((v) => v.member_id));
  const ids = new Set((electorate ?? []).map((e) => e.member_id).filter((id) => !voted.has(id)));
  return members.filter((m) => ids.has(m.id)).map((m) => m.email);
}

async function electorateEmails(motionId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: electorate }, members] = await Promise.all([
    admin.from('motion_electorate').select('member_id').eq('motion_id', motionId),
    activeMembers(),
  ]);
  const ids = new Set((electorate ?? []).map((e) => e.member_id));
  return members.filter((m) => ids.has(m.id)).map((m) => m.email);
}

function deadlineText(iso: string | null): string {
  return iso ? `${formatDateTime(iso)} (Central)` : 'the deadline';
}

// ─── Motion lifecycle ────────────────────────────────────────────────────────

export async function notifyPublished(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.role !== 'chair' && r.notify_new_motions).map((r) => r.email);
  await sendEach(to, {
    subject: `New motion: ${m.title}`,
    ...render({
      eyebrow: m.motion_number,
      title: m.title,
      paragraphs: [
        'The chair has published a new motion. It needs one member to move it and another to second it. Voting opens as soon as it is seconded.',
      ],
      button: { href: motionUrl(m.id), label: 'Read the motion' },
    }),
  });
}

/** The chair's call for a motion, call for a second, or reminder to vote. */
export async function notifyCall(motionId: string, status: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();

  if (status === 'open' || status === 'moved') {
    const mover = members.find((r) => r.id === m.moved_by);
    const to = members
      .filter((r) => (r.role === 'member' || r.role === 'secretary') && r.id !== m.moved_by)
      .map((r) => r.email);
    await sendEach(to, {
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
    });
    return;
  }

  if (status === 'voting') {
    await notifyReminder(motionId, 'chair');
  }
}

export async function notifyVotingOpened(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'voting') return;
  const to = await electorateEmails(motionId);
  await sendEach(to, {
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
  });
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
  await sendEach(to, {
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
  });
}

export async function notifyExtended(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m || m.status !== 'voting') return;
  const to = await electorateEmails(motionId);
  await sendEach(to, {
    subject: `Deadline extended: ${m.title}`,
    ...render({
      eyebrow: m.motion_number,
      title: m.title,
      paragraphs: [`The chair extended voting. It now closes ${deadlineText(m.voting_deadline)}.`],
      quote: m.deadline_extension_note
        ? { text: m.deadline_extension_note, by: 'The chair' }
        : undefined,
      button: { href: motionUrl(m.id), label: 'Open the motion' },
    }),
  });
}

/** Approved or referred. */
export async function notifyOutcome(motionId: string): Promise<void> {
  const m = await loadMotion(motionId);
  if (!m) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.notify_results).map((r) => r.email);

  if (m.status === 'approved') {
    await sendEach(to, {
      subject: `Approved: ${m.title}`,
      ...render({
        eyebrow: m.motion_number,
        title: m.title,
        paragraphs: [
          `All ${m.electorate_size ? `${m.electorate_size} ` : ''}voting members voted Aye. The motion is approved and will be ratified at the next in-person meeting.`,
        ],
        button: { href: motionUrl(m.id), label: 'See the votes' },
      }),
    });
    return;
  }

  if (m.status === 'referred') {
    await sendEach(to, {
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
    });
  }
}

export async function notifyRatified(motionIds: readonly string[]): Promise<void> {
  if (motionIds.length === 0) return;
  const admin = createAdminClient();
  const { data: motions } = await admin
    .from('motions')
    .select('id, motion_number, title')
    .in('id', [...motionIds]);
  if (!motions?.length) return;
  const members = await activeMembers();
  const to = members.filter((r) => r.notify_results).map((r) => r.email);
  const list = motions.map((m) => `${m.motion_number} — ${m.title}`);
  await sendEach(to, {
    subject:
      motions.length === 1 ? `Ratified: ${motions[0].title}` : `${motions.length} motions ratified`,
    ...render({
      title: motions.length === 1 ? motions[0].title : `${motions.length} motions ratified`,
      paragraphs: ['Ratified at the in-person meeting:', ...list],
      button: { href: `${APP_URL}/motions?filter=approved`, label: 'View motions' },
    }),
  });
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
  const to = members.filter((r) => r.notify_comments && r.id !== authorId).map((r) => r.email);
  const excerpt = body.length > 400 ? `${body.slice(0, 400)}…` : body;
  await sendEach(to, {
    subject: `New comment: ${m.title}`,
    ...render({
      eyebrow: m.motion_number,
      title: m.title,
      paragraphs: [],
      quote: { text: excerpt, by: author?.full_name },
      button: { href: `${motionUrl(m.id)}#discussion`, label: 'Read and reply' },
    }),
  });
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
