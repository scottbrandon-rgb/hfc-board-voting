import 'server-only';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { one, query } from '@/lib/db';
import { SESSION_COOKIE, SESSION_DAYS, sessionCookieOptions } from '@/lib/session-cookie';

/**
 * Sign-in by emailed code (replacing Supabase Auth), and sessions.
 *
 *   * A code is 8 random digits, works once, for one hour, and allows five
 *     tries. Sending a new code cancels the older ones.
 *   * A member can ask for a code once a minute and five times an hour.
 *   * Only hashes of codes and session tokens are stored.
 *
 * Tables: login_codes and sessions (netlify/database/migrations/0002_sign_in.sql).
 */

const CODE_MINUTES = 60;
const MAX_TRIES = 5;
const WAIT_SECONDS = 60;
const CODES_PER_HOUR = 5;
/** The database's expiry moves forward at most this often (it is a write). */
const REFRESH_AFTER_HOURS = 12;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hashCode = (codeId: string, code: string) => sha256(`${codeId}:${code}`);

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface SignInMember {
  id: string;
  email: string;
  full_name: string;
}

/** The active board member with this email (any capitalisation), if any. */
export async function findActiveMember(email: string): Promise<SignInMember | null> {
  return one<SignInMember>(
    `select id, email, full_name from public.members
      where lower(email) = lower($1) and is_active
      limit 1`,
    [email.trim()],
  );
}

export type IssueResult = { ok: true; code: string } | { ok: false; reason: 'wait' | 'too_many' };

/** Creates a new code for a member, cancelling any earlier ones. */
export async function issueCode(memberId: string): Promise<IssueResult> {
  const recent = await one<{ last_minute: number; last_hour: number }>(
    `select count(*) filter (where created_at > now() - make_interval(secs => $2)) as last_minute,
            count(*) as last_hour
       from public.login_codes
      where member_id = $1 and created_at > now() - interval '1 hour'`,
    [memberId, WAIT_SECONDS],
  );
  if ((recent?.last_minute ?? 0) > 0) return { ok: false, reason: 'wait' };
  if ((recent?.last_hour ?? 0) >= CODES_PER_HOUR) return { ok: false, reason: 'too_many' };

  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  const id = randomUUID();
  await query(
    `update public.login_codes set expires_at = now()
      where member_id = $1 and used_at is null and expires_at > now()`,
    [memberId],
  );
  await query(
    `insert into public.login_codes (id, member_id, code_hash, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [id, memberId, hashCode(id, code), CODE_MINUTES],
  );
  return { ok: true, code };
}

/** Gives back the newest code, as if it had never been sent (when its email failed). */
export async function withdrawLatestCode(memberId: string): Promise<void> {
  await query(
    `delete from public.login_codes
      where id = (select id from public.login_codes where member_id = $1
                   order by created_at desc limit 1)`,
    [memberId],
  );
}

export type VerifyResult =
  | { ok: true; memberId: string }
  | { ok: false; reason: 'wrong' | 'expired' | 'too_many' };

/** Checks a code. Each check uses up one of the code's five tries. */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const member = await findActiveMember(email);
  if (!member || !/^\d{8}$/.test(code)) return { ok: false, reason: 'wrong' };

  const live = await one<{ id: string; code_hash: string }>(
    `update public.login_codes set attempts = attempts + 1
      where id = (select id from public.login_codes
                   where member_id = $1 and used_at is null and expires_at > now()
                   order by created_at desc limit 1)
        and attempts < $2
      returning id, code_hash`,
    [member.id, MAX_TRIES],
  );
  if (!live) {
    const spent = await one(
      `select 1 from public.login_codes
        where member_id = $1 and used_at is null and expires_at > now() and attempts >= $2
        limit 1`,
      [member.id, MAX_TRIES],
    );
    return { ok: false, reason: spent ? 'too_many' : 'expired' };
  }
  if (!sameHash(live.code_hash, hashCode(live.id, code))) return { ok: false, reason: 'wrong' };

  // Single use, even if the same code arrives twice at once.
  const used = await one(
    `update public.login_codes set used_at = now()
      where id = $1 and used_at is null returning id`,
    [live.id],
  );
  if (!used) return { ok: false, reason: 'expired' };
  return { ok: true, memberId: member.id };
}

/** Signs this browser in as the member. Call from a server action. */
export async function startSession(memberId: string, userAgent: string | null): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await query(
    `insert into public.sessions (token_hash, member_id, expires_at, user_agent)
     values ($1, $2, now() + make_interval(days => $3), $4)`,
    [sha256(token), memberId, SESSION_DAYS, userAgent?.slice(0, 300) ?? null],
  );
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);

  // Housekeeping: forget expired sessions and old codes.
  await query(`delete from public.sessions where expires_at < now()`);
  await query(`delete from public.login_codes where created_at < now() - interval '7 days'`);
}

export interface SessionMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

/**
 * The member this browser is signed in as, or null. A retired member is
 * still returned (is_active false) so the app can explain and sign them out.
 */
export async function sessionMember(): Promise<SessionMember | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = sha256(token);
  const row = await one<SessionMember & { stale: boolean }>(
    `select m.id, m.email, m.full_name, m.role, m.is_active,
            s.last_seen_at < now() - make_interval(hours => $2) as stale
       from public.sessions s
       join public.members m on m.id = s.member_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hash, REFRESH_AFTER_HOURS],
  );
  if (!row) return null;
  if (row.stale) {
    await query(
      `update public.sessions
          set last_seen_at = now(), expires_at = now() + make_interval(days => $2)
        where token_hash = $1`,
      [hash, SESSION_DAYS],
    );
  }
  const { stale: _stale, ...member } = row;
  return member;
}

/** Signs this browser out. Call from a route handler or server action. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await query(`delete from public.sessions where token_hash = $1`, [sha256(token)]);
  store.delete(SESSION_COOKIE);
}

/** Signs a member out everywhere (used when the chair retires them). */
export async function endAllSessions(memberId: string): Promise<void> {
  await query(`delete from public.sessions where member_id = $1`, [memberId]);
}
