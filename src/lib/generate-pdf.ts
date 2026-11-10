import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MotionPdf, type PdfMotionData } from '@/lib/pdf';
import { query, queryOne } from '@/lib/db';
import { fileExists, putFile } from '@/lib/storage';

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

interface PdfSourceMotion {
  id: string;
  motion_number: string;
  title: string;
  description: string;
  background: string | null;
  rules: string;
  status: string;
  result: string | null;
  motion_text_hash: string | null;
  moved_by: string | null;
  moved_at: string | null;
  seconded_by: string | null;
  seconded_at: string | null;
  voting_opened_at: string | null;
  voting_deadline: string | null;
  decided_at: string | null;
  ratified_by: string | null;
  ratified_at: string | null;
  created_by: string | null;
  meeting_date: string | null;
  referral_reason: string | null;
  referral_note: string | null;
  in_person_result: string | null;
  in_person_note: string | null;
}

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
  const motion = await queryOne<PdfSourceMotion>(
    `select id, motion_number, title, description, background, rules, status, result,
            motion_text_hash, moved_by, moved_at, seconded_by, seconded_at, voting_opened_at,
            voting_deadline, decided_at, ratified_by, ratified_at, created_by, meeting_date,
            referral_reason, referral_note, in_person_result, in_person_note
       from public.motions where id = $1`,
    [motionId],
  );

  if (!motion) throw new Error(`Motion not found: ${motionId}`);

  const [members, attachments, voteRows, electorate, commentRows] = await Promise.all([
    query<{ id: string; full_name: string; role: string }>(
      'select id, full_name, role from public.members',
    ),
    query<{ file_name: string; file_hash: string }>(
      `select file_name, file_hash from public.motion_attachments
        where motion_id = $1 order by uploaded_at`,
      [motionId],
    ),
    query<{
      member_id: string;
      vote: string;
      reason: string | null;
      note: string | null;
      cast_at: string;
      updated_at: string | null;
    }>(
      `select member_id, vote, reason, note, cast_at, updated_at from public.votes
        where motion_id = $1 order by cast_at`,
      [motionId],
    ),
    query<{ member_id: string }>(
      'select member_id from public.motion_electorate where motion_id = $1',
      [motionId],
    ),
    query<{ member_id: string | null; body: string; created_at: string }>(
      `select member_id, body, created_at from public.comments
        where motion_id = $1 order by created_at`,
      [motionId],
    ),
  ]);

  const nameOf = (id: string | null): string | null =>
    id ? (members.find((m) => m.id === id)?.full_name ?? null) : null;

  // Current rules: one row per member of the electorate, including members
  // who did not vote. Previous rules: the ballots as recorded.
  let votes: PdfMotionData['votes'];
  if (motion.rules === 'unanimous_v1') {
    const byMember = new Map(voteRows.map((v) => [v.member_id, v]));
    votes = electorate
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
    votes = voteRows.map((v) => ({
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
    attachments,
    votes,
    comments: commentRows.map((c) => ({
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
  await putFile(BUCKET, storagePath, buffer, 'application/pdf');
  return storagePath;
}

/** Whether the official record has been generated for this motion. */
export async function pdfExists(motionId: string): Promise<boolean> {
  return fileExists(BUCKET, `${motionId}.pdf`).catch(() => false);
}
