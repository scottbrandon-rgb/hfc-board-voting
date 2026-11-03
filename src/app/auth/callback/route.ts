import { NextResponse } from 'next/server';

// Sign-in links from the old Supabase emails end up here. They no longer
// work; send the member to the sign-in page for a code instead.
export async function GET() {
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return NextResponse.redirect(`${appUrl}/login?error=link_expired`);
}
