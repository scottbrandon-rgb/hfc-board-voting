import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

// Next.js 16 renamed Middleware to Proxy. This runs before every page: it
// sends visitors without a sign-in cookie to the sign-in page, and keeps a
// signed-in device's cookie fresh. Whether the cookie is still valid is
// checked against the database by src/lib/dal.ts on each page.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPath = path === '/login' || path.startsWith('/auth/') || path.startsWith('/setup/');

  if (!token && !isPublicPath) {
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

  const response = NextResponse.next({ request });
  // A device stays signed in for 90 days after it was last used.
  if (token && !path.startsWith('/auth/')) {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except: Next.js internals and static files; the scheduled-jobs
    // and health endpoints (they authenticate themselves, and the scheduler has
    // no session); and the app manifest and icons, which phones fetch without
    // the member's sign-in when adding the site to the home screen.
    '/((?!_next/static|_next/image|api/cron|api/health|manifest\\.webmanifest|icon|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
