import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Reached when someone is signed in but no longer an active board member.
// Signing out here (a route handler can clear cookies; a page cannot) ends the
// redirect loop between the dashboard and the sign-in page.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL('/login', request.url);
  url.searchParams.set('notice', 'inactive');
  return NextResponse.redirect(url, { status: 303 });
}
