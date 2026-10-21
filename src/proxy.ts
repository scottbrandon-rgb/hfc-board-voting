import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeNext } from '@/lib/safe-next';

// Next.js 16 renamed Middleware to Proxy. This file refreshes the Supabase
// auth session on every request and gates the board pages behind sign-in.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Required: refresh the access token if expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = path === '/login' || path.startsWith('/auth/');

  if (!user && !isAuthPath) {
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

  if (user && path === '/login') {
    const url = new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url);
    return NextResponse.redirect(url);
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
