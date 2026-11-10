import { NextResponse, type NextRequest } from 'next/server';
import { endSession } from '@/lib/session';

// Reached when someone is signed in but no longer an active board member.
// Signing out here (a route handler can clear cookies; a page cannot) ends the
// redirect loop between the dashboard and the sign-in page.
export async function GET(request: NextRequest) {
  await endSession();
  const url = new URL('/login', request.url);
  url.searchParams.set('notice', 'inactive');
  return NextResponse.redirect(url, { status: 303 });
}
