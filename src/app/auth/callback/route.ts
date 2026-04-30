import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Use the canonical APP_URL so redirects always land on the primary domain,
  // not a Netlify deploy-preview subdomain.
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${appUrl}${next}`);
}
