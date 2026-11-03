/**
 * GET /api/health
 * Health check: the database (and that its migrations have run), file
 * storage and required settings. Returns 200 if every check passes, 500
 * otherwise.
 *
 * The details are shown only with `Authorization: Bearer <CRON_SECRET>`; the
 * public answer is just ok / not ok, so the page reveals nothing about the board.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { one } from '@/lib/db';
import { fileExists } from '@/lib/files';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'APP_URL', 'CRON_SECRET'];

function message(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

export async function GET(request: NextRequest) {
  const checks: Record<string, string | number> = {};
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
    const row = await one<{ voting: string | null; sign_in: string | null; members: number }>(
      `select to_regclass('public.board_settings')::text as voting,
              to_regclass('public.sessions')::text as sign_in,
              (select count(*) from public.members where is_active) as members`,
    );
    checks.db = 'ok';
    if (row?.voting) checks.voting_rules_migration = 'ok';
    else fail('voting_rules_migration', 'missing: 0001_baseline.sql has not run');
    if (row?.sign_in) checks.sign_in_migration = 'ok';
    else fail('sign_in_migration', 'missing: 0002_sign_in.sql has not run');
    // Zero until the records are copied over from Supabase (/setup/import).
    checks.active_members = row?.members ?? 0;
    if (!row?.members) fail('records', 'no members yet: open /setup/import');
  } catch (err) {
    fail('db', `error: ${message(err)}`);
  }

  try {
    await fileExists('motion-pdfs', 'health-check.pdf');
    checks.files = 'ok';
  } catch (err) {
    fail('files', `error: ${message(err)}`);
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
