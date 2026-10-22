/**
 * Background jobs, called every 15 minutes by the Netlify scheduled function.
 * Requires `Authorization: Bearer <CRON_SECRET>`.
 *
 *  1. Close votes whose deadline has passed (approved if every member voted
 *     Aye, otherwise referred to the in-person meeting), and refer motions
 *     that were not moved or seconded within the voting period.
 *  2. Send reminders to members who have not voted: about 24 hours and about
 *     4 hours before the deadline, each exactly once.
 *
 * The rules and the "exactly once" bookkeeping live in the database
 * (vote_close_expired, vote_claim_reminders); this route only sends email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyOutcome, notifyReminder } from '@/lib/notify';
import { generateAndStorePdf } from '@/lib/generate-pdf';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: closed, error: closeError } = await admin.rpc('vote_close_expired');
  if (closeError) {
    console.error('[cron] vote_close_expired failed:', closeError);
    return NextResponse.json({ ok: false, error: closeError.message }, { status: 500 });
  }

  const { data: reminders, error: reminderError } = await admin.rpc('vote_claim_reminders');
  if (reminderError) {
    console.error('[cron] vote_claim_reminders failed:', reminderError);
    return NextResponse.json({ ok: false, error: reminderError.message }, { status: 500 });
  }

  for (const row of closed ?? []) {
    await notifyOutcome(row.r_motion_id);
    await generateAndStorePdf(row.r_motion_id).catch((err) =>
      console.error('[cron] PDF generation failed:', err),
    );
  }
  for (const row of reminders ?? []) {
    await notifyReminder(row.r_motion_id, row.r_kind === 'final' ? 'final' : '24h');
  }

  const summary = {
    ok: true,
    closed: (closed ?? []).map((r) => ({
      id: r.r_motion_id,
      outcome: r.r_outcome,
      reason: r.r_reason,
    })),
    reminders: (reminders ?? []).length,
  };
  console.log('[cron] background jobs:', JSON.stringify(summary));
  return NextResponse.json(summary);
}

// GET runs the same jobs (still requires the secret) for manual checks.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
