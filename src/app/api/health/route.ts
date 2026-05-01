/**
 * GET /api/health
 * Public health check — verifies DB connectivity and required env vars.
 * Returns 200 if all checks pass, 500 otherwise.
 * Used by Netlify uptime monitoring and manual pre-deploy verification.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'APP_URL',
  'CRON_SECRET',
];

export async function GET() {
  const checks: Record<string, boolean | string> = {};
  let ok = true;

  // Env var check
  for (const key of REQUIRED_ENV) {
    const present = !!process.env[key];
    checks[key] = present;
    if (!present) ok = false;
  }

  // DB connectivity
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (error) throw error;
    checks['db'] = `ok (${count} active members)`;
  } catch (err) {
    checks['db'] = `error: ${err instanceof Error ? err.message : String(err)}`;
    ok = false;
  }

  // Storage bucket check
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket('motion-attachments');
    if (error) throw error;
    checks['storage_attachments'] = data.public ? 'WARN: bucket is public!' : 'ok (private)';
    if (data.public) ok = false;
  } catch (err) {
    checks['storage_attachments'] = `error: ${err instanceof Error ? err.message : String(err)}`;
    ok = false;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket('motion-pdfs');
    if (error) throw error;
    checks['storage_pdfs'] = data.public ? 'WARN: bucket is public!' : 'ok (private)';
    if (data.public) ok = false;
  } catch (err) {
    checks['storage_pdfs'] = `error: ${err instanceof Error ? err.message : String(err)}`;
    ok = false;
  }

  return NextResponse.json(
    { ok, timestamp: new Date().toISOString(), checks },
    { status: ok ? 200 : 500 },
  );
}
