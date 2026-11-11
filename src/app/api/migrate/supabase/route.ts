/**
 * ONE-TIME MOVE from Supabase to Netlify (see MIGRATION.md). Remove once done.
 *
 *   GET  /api/migrate/supabase              → what is in Supabase and in Netlify
 *   POST /api/migrate/supabase?step=data    → copy the board's records
 *   POST /api/migrate/supabase?step=files   → copy documents and PDFs (repeat
 *                                             until "remaining" is 0)
 *   Add &replace=1 to copy again over what is already there.
 *
 * Every call needs `Authorization: Bearer <CRON_SECRET>`.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  copyData,
  copyFiles,
  countSource,
  countTarget,
  supabaseSource,
} from '@/lib/import-supabase';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization') ?? '';
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const source = supabaseSource();
  try {
    return json({
      ok: true,
      deployContext: process.env.DEPLOY_CONTEXT ?? 'unknown',
      supabase: source ? await countSource(source) : 'not configured',
      netlify: await countTarget(),
    });
  } catch (err) {
    return json({ ok: false, error: errorMessage(err) }, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const source = supabaseSource();
  if (!source) {
    return json(
      {
        ok: false,
        error: 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Netlify.',
      },
      400,
    );
  }
  const step = req.nextUrl.searchParams.get('step');
  const replace = req.nextUrl.searchParams.get('replace') === '1';

  try {
    if (step === 'data') {
      const result = await copyData(source, { replace });
      const [supabase, netlify] = await Promise.all([countSource(source), countTarget()]);
      const matches = Object.keys(supabase).every((t) => supabase[t] === netlify[t]);
      console.log('[migrate] data copied:', JSON.stringify(result.copied));
      return json({ ok: matches, step, ...result, supabase, netlify, matches });
    }
    if (step === 'files') {
      const report = await copyFiles(source, { replace, budgetMs: 7000 });
      const ok = report.failed.length === 0 && report.fingerprintMismatch.length === 0;
      console.log('[migrate] files:', JSON.stringify({ ...report, copied: report.copied.length }));
      return json({ ok, step, done: report.remaining === 0, ...report });
    }
    return json({ ok: false, error: 'Add ?step=data or ?step=files' }, 400);
  } catch (err) {
    console.error('[migrate] failed:', err);
    return json({ ok: false, step, error: errorMessage(err) }, 500);
  }
}
