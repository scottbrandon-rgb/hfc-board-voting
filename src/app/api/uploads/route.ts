/**
 * POST /api/uploads?motion=<id>&path=<upload path>&part=<n>
 *
 * Receives one piece of a document the chair is adding to a draft motion
 * (Netlify accepts at most about 4.5 MB of file data per request, so the
 * browser sends documents in 3 MB pieces). registerAttachment in
 * src/app/(app)/motions/new/actions.ts joins the pieces afterwards.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/lib/dal';
import { one } from '@/lib/db';
import { putFile } from '@/lib/files';
import { chunkCount, chunkKey, isUploadPathFor } from '@/lib/uploads';
import { MAX_ATTACHMENT_BYTES, UPLOAD_CHUNK_BYTES } from '@/lib/rules';

export const dynamic = 'force-dynamic';

function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member || member.role !== 'chair') return fail(403, 'Only the chair can add documents.');

  const params = request.nextUrl.searchParams;
  const motionId = params.get('motion') ?? '';
  const path = params.get('path') ?? '';
  const part = Number(params.get('part'));
  if (!/^[0-9a-f-]{36}$/i.test(motionId) || !isUploadPathFor(motionId, path))
    return fail(400, 'Invalid upload.');
  if (!Number.isInteger(part) || part < 0 || part >= chunkCount(MAX_ATTACHMENT_BYTES))
    return fail(400, 'Invalid upload.');

  const motion = await one<{ status: string }>('select status from public.motions where id = $1', [
    motionId,
  ]);
  if (motion?.status !== 'draft') return fail(409, 'Documents can only be added to a draft.');

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > UPLOAD_CHUNK_BYTES)
    return fail(413, 'That piece of the upload is the wrong size.');

  await putFile('motion-attachments', chunkKey(path, part), bytes, 'application/octet-stream');
  return NextResponse.json({ ok: true });
}
