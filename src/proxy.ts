import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/safe-next';

// Next.js 16 renamed Middleware to Proxy. This is the quick check at the door:
// no session cookie, no board pages. The real check (is the session valid, is
// the member still active?) happens on the server, in src/lib/dal.ts, for
// every page and action. Proxy also renews the cookie's lifetime on each
// visit, so a member who uses the site stays signed in.

const SESSION_COOKIE = 'hfc_session'; // keep in step with src/lib/session.ts
const SESSION_SECONDS = 90 * 24 * 60 * 60;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPath = path === '/login' || path.startsWith('/auth/');
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (isAuthPath) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Return to the page they asked for (a motion linked from an email, say).
    const wanted = path + request.nextUrl.search;
    if (request.method === 'GET' && path !== '/' && safeNext(wanted) === wanted) {
      url.searchParams.set('next', wanted);
    }
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (!path.startsWith('/auth/')) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except: Next.js internals and static files; the scheduled-jobs,
    // health and one-time migration endpoints (they authenticate themselves
    // with CRON_SECRET, and callers have no session); and the app manifest and
    // icons, which phones fetch without the member's sign-in when adding the
    // site to the home screen.
    '/((?!_next/static|_next/image|api/cron|api/health|api/migrate|manifest\\.webmanifest|icon|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
