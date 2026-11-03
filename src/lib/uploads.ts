import 'server-only';
import { UPLOAD_CHUNK_BYTES } from '@/lib/rules';

/** Document types a motion may carry. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
]);

export function chunkCount(size: number): number {
  return Math.max(1, Math.ceil(size / UPLOAD_CHUNK_BYTES));
}

/** Where piece `index` of an upload waits until registerAttachment joins them. */
export function chunkKey(path: string, index: number): string {
  return `uploads/${path}/part-${String(index).padStart(4, '0')}`;
}

/** An upload path made by prepareUpload for this motion. */
export function isUploadPathFor(motionId: string, path: string): boolean {
  const prefix = `motions/${motionId}/`;
  return (
    path.startsWith(prefix) &&
    /^[0-9a-f]{8}-[\w.\-() ]{1,120}$/.test(path.slice(prefix.length)) &&
    !path.includes('..')
  );
}
