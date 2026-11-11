import { NextResponse, type NextRequest } from 'next/server';
import { endSession } from '@/lib/session';

// Reached when the browser has a session cookie the database no longer
// recognises (expired, or signed out elsewhere). Clearing the cookie here
// stops the sign-in page sending the browser straight back.
export async function GET(request: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
