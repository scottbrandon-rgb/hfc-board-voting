/**
 * GET /api/health
 * Health check: database, voting rules, sign-in tables, file storage and
 * required settings. Returns 200 if every check passes, 500 otherwise.
 *
 * The details are shown only with `Authorization: Bearer <CRON_SECRET>`; the
 * public answer is just ok / not ok, so the page reveals nothing about the board.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { fileExists, storeName, type Bucket } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'APP_URL', 'CRON_SECRET'];

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
  checks.deploy_context = process.env.DEPLOY_CONTEXT ?? 'unknown';

  try {
    const row = await queryOne<{ members: number; rules: boolean; sign_in: boolean }>(
      `select (select count(*)::int from public.members where is_active) as members,
              to_regprocedure('public.vote_cast_ballot(uuid,uuid,text,text,text,inet,text)') is not null as rules,
              to_regclass('private.sessions') is not null as sign_in`,
    );
    checks.db = 'ok';
    if (row?.rules) checks.voting_rules = 'ok';
    else fail('voting_rules', 'missing: the baseline migration has not been applied');
    if (row?.sign_in) checks.sign_in_tables = 'ok';
    else fail('sign_in_tables', 'missing: migration 0002_sign_in has not been applied');
    // An empty board means the Supabase data has not been imported yet.
    if ((row?.members ?? 0) > 0) checks.active_members = String(row?.members);
    else fail('active_members', 'none: import the board data (see MIGRATION.md)');
  } catch (err) {
    fail('db', `error: ${message(err)}`);
  }

  for (const bucket of ['motion-attachments', 'motion-pdfs'] as Bucket[]) {
    try {
      await fileExists(bucket, '_health');
      checks[`storage:${bucket}`] = `ok (${storeName(bucket)})`;
    } catch (err) {
      fail(`storage:${bucket}`, `error: ${message(err)}`);
    }
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
