import { NextResponse } from 'next/server';

// Old magic-link emails from before sign-in codes still point here. Those
// links no longer work; send the member to sign in with a code.
export async function GET() {
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return NextResponse.redirect(`${appUrl}/login?error=link_expired`);
}
