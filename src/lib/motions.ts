import 'server-only';
import { createHash } from 'node:crypto';
import { query } from '@/lib/db';

const TIMEZONE = process.env.TIMEZONE || 'America/Chicago';

export function currentBoardYear(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
  }).format(new Date());
}

// Helper for "last 30 days" filtering. Wrapped so server-component callers
// don't trip the react-hooks/purity lint on Date.now().
export function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

// HFC-YYYY-NNN. Generates the next sequential number for the current year.
// Race-prone under heavy concurrency; the unique constraint on motion_number
// is the safety net — caller should retry once on conflict.
export async function nextMotionNumber(): Promise<string> {
  const year = currentBoardYear();
  const prefix = `HFC-${year}-`;

  const rows = await query<{ motion_number: string }>(
    `select motion_number from public.motions
      where motion_number like $1
      order by motion_number desc limit 1`,
    [`${prefix}%`],
  );

  const lastNum = rows[0]?.motion_number?.slice(prefix.length) ?? '0';
  const nextNum = parseInt(lastNum, 10) + 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

export async function sha256Hex(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const hash = createHash('sha256');
  hash.update(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer);
  return hash.digest('hex');
}

// motion_text_hash = sha256( title + "\n" + description + "\n" + sorted_concat(attachment.file_hash) )
// Computed when voting opens, not at creation. Exposed here so Step 7 can use it.
export function computeMotionTextHash(
  title: string,
  description: string,
  attachmentHashes: string[],
): string {
  const sorted = [...attachmentHashes].sort();
  const payload = `${title}\n${description}\n${sorted.join('')}`;
  return createHash('sha256').update(payload).digest('hex');
}
