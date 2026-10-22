import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MotionPdf, type PdfMotionData } from '@/lib/pdf';
import { createAdminClient } from '@/lib/supabase/admin';

const TZ = process.env.TIMEZONE || 'America/Chicago';
const BUCKET = 'motion-pdfs';

/** Statuses that have an official record. */
export const PDF_STATUSES: readonly string[] = [
  'approved',
  'referred',
  'ratified',
  'decided_in_person',
  'decided_passed',
  'decided_failed',
  'decided_deferred',
];

function fmtGenerated(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export async function generateAndStorePdf(motionId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select(
      'id, motion_number, title, description, background, rules, status, result, motion_text_hash, moved_by, moved_at, seconded_by, seconded_at, voting_opened_at, voting_deadline, decided_at, ratified_by, ratified_at, created_by, meeting_date, referral_reason, referral_note, in_person_result, in_person_note',
    )
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) throw new Error(`Motion not found: ${motionId}`);

  const [
    { data: members },
    { data: attachments },
    { data: voteRows },
    { data: electorate },
    { data: commentRows },
  ] = await Promise.all([
    admin.from('members').select('id, full_name, role'),
    admin
      .from('motion_attachments')
      .select('file_name, file_hash')
      .eq('motion_id', motionId)
      .order('uploaded_at'),
    admin
      .from('votes')
      .select('member_id, vote, reason, note, cast_at, updated_at')
      .eq('motion_id', motionId)
      .order('cast_at'),
    admin.from('motion_electorate').select('member_id').eq('motion_id', motionId),
    admin
      .from('comments')
      .select('member_id, body, created_at')
      .eq('motion_id', motionId)
      .order('created_at'),
  ]);

  const nameOf = (id: string | null): string | null =>
    id ? (members?.find((m) => m.id === id)?.full_name ?? null) : null;

  // Current rules: one row per member of the electorate, including members
  // who did not vote. Previous rules: the ballots as recorded.
  let votes: PdfMotionData['votes'];
  if (motion.rules === 'unanimous_v1') {
    const byMember = new Map((voteRows ?? []).map((v) => [v.member_id, v]));
    votes = (electorate ?? [])
      .map((e) => {
        const v = byMember.get(e.member_id);
        return {
          memberName: nameOf(e.member_id) ?? 'Board member',
          vote: v?.vote ?? 'none',
          reason: v?.reason ?? null,
          note: v?.note ?? null,
          cast_at: v ? (v.updated_at ?? v.cast_at) : null,
        };
      })
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  } else {
    votes = (voteRows ?? []).map((v) => ({
      memberName: nameOf(v.member_id) ?? 'Board member',
      vote: v.vote,
      reason: null,
      note: null,
      cast_at: v.cast_at,
    }));
  }

  const data: PdfMotionData = {
    motion_number: motion.motion_number,
    title: motion.title,
    description: motion.description,
    background: motion.background,
    rules: motion.rules,
    status: motion.status,
    result: motion.result,
    motion_text_hash: motion.motion_text_hash,
    voting_opened_at: motion.voting_opened_at,
    voting_deadline: motion.voting_deadline,
    decided_at: motion.decided_at,
    ratified_at: motion.ratified_at,
    meeting_date: motion.meeting_date,
    referral_reason: motion.referral_reason,
    referral_note: motion.referral_note,
    in_person_result: motion.in_person_result,
    in_person_note: motion.in_person_note,
    moverName: nameOf(motion.moved_by),
    moved_at: motion.moved_at,
    seconderName: nameOf(motion.seconded_by),
    seconded_at: motion.seconded_at,
    chairName: nameOf(motion.created_by) ?? 'The chair',
    ratifiedByName: nameOf(motion.ratified_by),
    attachments: attachments ?? [],
    votes,
    comments: (commentRows ?? []).map((c) => ({
      authorName: nameOf(c.member_id) ?? 'Former board member',
      created_at: c.created_at,
      body: c.body,
    })),
    generatedAt: fmtGenerated(new Date().toISOString()),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(MotionPdf, { data }) as any;
  const buffer = await renderToBuffer(element);

  const storagePath = `${motionId}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

  return storagePath;
}

export async function getPdfSignedUrl(motionId: string, expiresIn = 3600): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(`${motionId}.pdf`, expiresIn, { download: true });
  return data?.signedUrl ?? null;
}
