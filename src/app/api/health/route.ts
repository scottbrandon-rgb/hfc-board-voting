/**
 * GET /api/health
 * Health check: database, storage buckets, required settings and the voting
 * rules migration. Returns 200 if every check passes, 500 otherwise.
 *
 * The details are shown only with `Authorization: Bearer <CRON_SECRET>`; the
 * public answer is just ok / not ok, so the page reveals nothing about the board.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'APP_URL',
  'CRON_SECRET',
];

function message(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

export async function GET(request: NextRequest) {
  const checks: Record<string, string> = {};
  let ok = true;
  const fail = (key: string, detail: string) => {
    checks[key] = detail;
    ok = false;
  };

  for (const key of REQUIRED_ENV) {
    if (process.env[key]) checks[key] = 'set';
    else fail(key, 'missing');
  }

  try {
    const admin = createAdminClient();

    const { error: dbError } = await admin.from('members').select('id', { head: true }).limit(1);
    if (dbError) fail('db', `error: ${dbError.message}`);
    else checks.db = 'ok';

    // Migration 015 adds the unanimous voting rules; the app needs it.
    const { error: rulesError } = await admin
      .from('board_settings')
      .select('id', { head: true })
      .limit(1);
    if (rulesError)
      fail('voting_rules_migration', 'missing: apply supabase/migrations/015_unanimous_voting.sql');
    else checks.voting_rules_migration = 'ok';

    for (const bucket of ['motion-attachments', 'motion-pdfs']) {
      const { data, error } = await admin.storage.getBucket(bucket);
      if (error) fail(`storage:${bucket}`, `error: ${error.message}`);
      else if (data.public) fail(`storage:${bucket}`, 'WARN: bucket is public');
      else checks[`storage:${bucket}`] = 'ok (private)';
    }
  } catch (err) {
    fail('db', `error: ${message(err)}`);
  }

  const secret = process.env.CRON_SECRET;
  const detailed = !!secret && request.headers.get('authorization') === `Bearer ${secret}`;

  return NextResponse.json(
    detailed
      ? { ok, timestamp: new Date().toISOString(), checks }
      : { ok, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
