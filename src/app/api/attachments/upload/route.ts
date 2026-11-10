/**
 * PUT /api/attachments/upload?path=…&part=N
 *
 * One piece (up to 4 MB) of a document the chair is attaching to a draft.
 * Netlify functions accept requests up to 6 MB, so the browser splits larger
 * files; registerAttachment() joins the pieces once all have arrived.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/lib/dal';
import { loadDraft } from '@/lib/attachments';
import { partKey, putFile } from '@/lib/storage';
import { MAX_ATTACHMENT_BYTES, UPLOAD_CHUNK_BYTES } from '@/lib/rules';

export const dynamic = 'force-dynamic';

const MAX_PARTS = Math.ceil(MAX_ATTACHMENT_BYTES / UPLOAD_CHUNK_BYTES);
const PATH = /^motions\/([0-9a-f-]{36})\/[\w.\-() ]+$/i;

function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function PUT(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return fail(401, 'Sign in again.');
  if (member.role !== 'chair') return fail(403, 'Only the chair can add documents.');

  const path = request.nextUrl.searchParams.get('path') ?? '';
  const part = Number(request.nextUrl.searchParams.get('part'));
  const match = PATH.exec(path);
  if (!match || path.includes('..')) return fail(400, 'Invalid upload.');
  if (!Number.isInteger(part) || part < 0 || part >= MAX_PARTS) return fail(400, 'Invalid upload.');

  const draft = await loadDraft(match[1]);
  if (!draft || draft.status !== 'draft')
    return fail(409, 'Documents can only be added to a draft.');

  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > UPLOAD_CHUNK_BYTES)
    return fail(413, 'That piece of the file is the wrong size.');

  await putFile(
    'motion-attachments',
    partKey(path, part),
    body,
    request.headers.get('content-type') ?? 'application/octet-stream',
  );
  return NextResponse.json({ ok: true });
}
