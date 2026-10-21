import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

// Legacy magic-link callback. Sign-in now uses emailed codes, but older links
// may still arrive here.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  // Always redirect to the canonical domain, not a Netlify preview URL.
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${appUrl}${next}`);
}
