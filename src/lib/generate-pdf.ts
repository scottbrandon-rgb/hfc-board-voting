import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MotionPdf, type PdfMotionData } from '@/lib/pdf';
import { one, query } from '@/lib/db';
import type { MotionRow, VoteRow } from '@/lib/db-types';
import { fileExists, putFile } from '@/lib/files';

const TZ = process.env.TIMEZONE || 'America/Chicago';

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
  const motion = await one<MotionRow>('select * from public.motions where id = $1', [motionId]);

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
    query<Pick<VoteRow, 'member_id' | 'vote' | 'reason' | 'note' | 'cast_at' | 'updated_at'>>(
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

  const storagePath = pdfKey(motionId);
  await putFile('motion-pdfs', storagePath, new Uint8Array(buffer), 'application/pdf');
  return storagePath;
}

export function pdfKey(motionId: string): string {
  return `${motionId}.pdf`;
}

/**
 * Where the chair or secretary downloads the official record, if it has been
 * made. Served by src/app/api/files/record/[id], which checks their role.
 */
export async function getPdfUrl(motionId: string): Promise<string | null> {
  return (await fileExists('motion-pdfs', pdfKey(motionId)))
    ? `/api/files/record/${motionId}`
    : null;
}
