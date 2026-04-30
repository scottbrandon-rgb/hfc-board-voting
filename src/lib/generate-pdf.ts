import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MotionPdf, type PdfMotionData } from '@/lib/pdf';
import { createAdminClient } from '@/lib/supabase/admin';

const TZ = process.env.TIMEZONE || 'America/Chicago';
const BUCKET = 'motion-pdfs';

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

  // ── Fetch motion ────────────────────────────────────────────────────────────
  const { data: motion } = await admin
    .from('motions')
    .select('id, motion_number, title, description, status, result, motion_text_hash, moved_by, moved_at, seconded_by, seconded_at, voting_opened_at, decided_at, ratified_by, ratified_at, created_by')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) throw new Error(`Motion not found: ${motionId}`);

  // ── Fetch all members (for name lookups) ────────────────────────────────────
  const { data: members } = await admin
    .from('members')
    .select('id, full_name, role');

  const nameOf = (id: string | null): string | null =>
    id ? (members?.find((m) => m.id === id)?.full_name ?? null) : null;

  const chair = members?.find((m) => m.role === 'chair');

  // ── Fetch attachments ───────────────────────────────────────────────────────
  const { data: attachments } = await admin
    .from('motion_attachments')
    .select('file_name, file_hash')
    .eq('motion_id', motionId)
    .order('uploaded_at');

  // ── Fetch votes with member names ───────────────────────────────────────────
  const { data: voteRows } = await admin
    .from('votes')
    .select('member_id, vote, cast_at')
    .eq('motion_id', motionId)
    .order('cast_at');

  const votes = (voteRows ?? []).map((v) => ({
    memberName: nameOf(v.member_id) ?? 'Board member',
    vote: v.vote,
    cast_at: v.cast_at,
  }));

  // ── Fetch comments ──────────────────────────────────────────────────────────
  const { data: commentRows } = await admin
    .from('comments')
    .select('member_id, body, created_at')
    .eq('motion_id', motionId)
    .order('created_at');

  const comments = (commentRows ?? []).map((c) => ({
    authorName: nameOf(c.member_id) ?? 'Board member',
    created_at: c.created_at,
    body: c.body,
  }));

  // ── Assemble data ───────────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const data: PdfMotionData = {
    motion_number: motion.motion_number,
    title: motion.title,
    description: motion.description,
    status: motion.status,
    result: motion.result,
    motion_text_hash: motion.motion_text_hash,
    voting_opened_at: motion.voting_opened_at,
    decided_at: motion.decided_at,
    ratified_at: motion.ratified_at,
    moverName: nameOf(motion.moved_by),
    moved_at: motion.moved_at,
    seconderName: nameOf(motion.seconded_by),
    seconded_at: motion.seconded_at,
    chairName: chair?.full_name ?? 'Chair',
    ratifiedByName: nameOf(motion.ratified_by),
    attachments: attachments ?? [],
    votes,
    comments,
    generatedAt: fmtGenerated(generatedAt),
  };

  // ── Render PDF ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(MotionPdf, { data }) as any;
  const buffer = await renderToBuffer(element);

  // ── Upload to Supabase Storage ──────────────────────────────────────────────
  const storagePath = `${motionId}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
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
    .createSignedUrl(`${motionId}.pdf`, expiresIn);
  return data?.signedUrl ?? null;
}
