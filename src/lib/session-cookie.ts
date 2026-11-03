// The sign-in cookie. Shared by the proxy (which runs before every page) and
// the server code in src/lib/auth.ts.

export const SESSION_COOKIE = 'hfc_session';

/** A device stays signed in for 90 days after it was last used. */
export const SESSION_DAYS = 90;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
