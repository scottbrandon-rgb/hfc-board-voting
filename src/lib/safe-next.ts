/**
 * Where to go after signing in. Only paths on this site are allowed:
 * "/motions/x" is fine; "//evil.example", "/\evil" or "https://…" are not.
 */
export function safeNext(requested: string | null | undefined): string {
  if (!requested) return '/';
  return /^\/(?![/\\])[\w\-./?=&%]*$/.test(requested) && !requested.startsWith('/login')
    ? requested
    : '/';
}
