import { NextResponse, type NextRequest } from 'next/server';
import { endSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
