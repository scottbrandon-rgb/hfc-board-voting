import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { query, queryOne } from '@/lib/db';

/**
 * Board sign-in, replacing Supabase Auth.
 *
 *  - A member on the board list asks for a code. The app emails an 8-digit
 *    code and stores only its SHA-256 hash, for one hour. A code allows five
 *    guesses; a new code can be sent once a minute, five times an hour.
 *  - The right code starts a session: a random 256-bit token in an HTTP-only
 *    cookie, with only its hash in the database. Sessions last 90 days from
 *    the last visit, so a phone stays signed in.
 *  - Signing out, retiring a member or changing their email ends sessions.
 */

export const SESSION_COOKIE = 'hfc_session';
export const SESSION_DAYS = 90;
const CODE_MINUTES = 60;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

function codeHash(email: string, code: string): string {
  return sha256(`${email}:${code}`);
}

export function cookieOptions(maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

// ─── Codes ───────────────────────────────────────────────────────────────────

export type IssueResult = { ok: true; code: string } | { ok: false; reason: 'wait' | 'too_many' };

/** Creates a new code for `email`, replacing any earlier one. */
export async function issueCode(email: string): Promise<IssueResult> {
  const existing = await queryOne<{ sent_ago: number; window_ago: number; sends: number }>(
    `select extract(epoch from now() - sent_at)::int as sent_ago,
            extract(epoch from now() - window_start)::int as window_ago, sends
       from private.sign_in_codes where email = $1`,
    [email],
  );
  if (existing && existing.sent_ago < RESEND_SECONDS) return { ok: false, reason: 'wait' };
  const newWindow = !existing || existing.window_ago >= 3600;
  if (!newWindow && existing.sends >= MAX_SENDS_PER_HOUR) return { ok: false, reason: 'too_many' };

  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  await query(
    `insert into private.sign_in_codes (email, code_hash, expires_at, attempts, sent_at, window_start, sends)
     values ($1, $2, now() + make_interval(mins => $3), 0, now(), now(), 1)
     on conflict (email) do update set
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       sent_at = now(),
       window_start = case when $4 then now() else private.sign_in_codes.window_start end,
       sends = case when $4 then 1 else private.sign_in_codes.sends + 1 end`,
    [email, codeHash(email, code), CODE_MINUTES, newWindow],
  );
  return { ok: true, code };
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'expired' | 'wrong' };

/** Checks a code. A right code is used up; each wrong guess counts. */
export async function checkCode(email: string, code: string): Promise<VerifyResult> {
  // Count the guess first, so parallel guesses cannot exceed the limit.
  const row = await queryOne<{ code_hash: string; attempts: number; live: boolean }>(
    `update private.sign_in_codes set attempts = attempts + 1
      where email = $1
      returning code_hash, attempts, expires_at > now() as live`,
    [email],
  );
  if (!row || !row.live || row.attempts > MAX_ATTEMPTS) return { ok: false, reason: 'expired' };
  if (!/^\d{8}$/.test(code) || !sameHash(row.code_hash, codeHash(email, code))) {
    return { ok: false, reason: row.attempts >= MAX_ATTEMPTS ? 'expired' : 'wrong' };
  }
  await query(`delete from private.sign_in_codes where email = $1`, [email]);
  return { ok: true };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Starts a session for the member and sets the cookie. */
export async function startSession(
  memberId: string,
  context: { p_ip: string | null; p_user_agent: string | null },
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await query(
    `insert into private.sessions (token_hash, member_id, expires_at, ip_address, user_agent)
     values ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [sha256(token), memberId, SESSION_DAYS, context.p_ip, context.p_user_agent?.slice(0, 500)],
  );
  // Housekeeping: drop expired sessions and codes.
  await query(`delete from private.sessions where expires_at < now()`);
  await query(`delete from private.sign_in_codes where expires_at < now() - interval '1 day'`);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
}

export interface SessionMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

/** The member whose session cookie this request carries, if it is valid. */
export async function readSession(): Promise<SessionMember | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = sha256(token);
  const row = await queryOne<SessionMember & { stale: boolean }>(
    `select m.id, m.email, m.full_name, m.role, m.is_active,
            s.last_seen_at < now() - interval '1 hour' as stale
       from private.sessions s join public.members m on m.id = s.member_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hash],
  );
  if (!row) return null;
  if (row.stale) {
    // Keep active sessions alive: 90 days from the last visit.
    await query(
      `update private.sessions set last_seen_at = now(),
              expires_at = now() + make_interval(days => $2)
        where token_hash = $1`,
      [hash, SESSION_DAYS],
    );
  }
  const { stale: _stale, ...member } = row;
  return member;
}

/** Ends this browser's session (route handlers and server actions only). */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query(`delete from private.sessions where token_hash = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Signs a member out everywhere (retired, or their email changed). */
export async function endAllSessions(memberId: string): Promise<void> {
  await query(`delete from private.sessions where member_id = $1`, [memberId]);
}
