'use server';

import { queryOne } from '@/lib/db';
import { requestContext } from '@/lib/dal';
import { sendOne, signInCodeMessage } from '@/lib/email';
import { checkCode, issueCode, startSession } from '@/lib/session';

export type SendCodeResult =
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };
export type VerifyCodeResult = { status: 'ok' } | { status: 'error'; message: string };

const NOT_ON_LIST =
  "That email isn't on the Deacon Board list. Check the spelling, or ask the chair to add you.";

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

async function activeMember(email: string) {
  return queryOne<{ id: string }>(
    `select id from public.members where lower(email) = $1 and is_active`,
    [email],
  );
}

/**
 * Checks the board list and emails a sign-in code. Only active board members
 * can receive one, so nobody else can use the form to send email.
 */
export async function sendCode(rawEmail: string): Promise<SendCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: 'error', message: 'Enter a valid email address.' };

  try {
    if (!(await activeMember(email))) return { status: 'error', message: NOT_ON_LIST };

    const issued = await issueCode(email);
    if (!issued.ok) {
      return {
        status: 'error',
        message:
          issued.reason === 'wait'
            ? 'A code was sent a moment ago. Wait a minute, then try again.'
            : 'Several codes have been sent in the last hour. Use the newest one, or try again later.',
      };
    }

    // Local development without Resend: the code appears in the terminal.
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'development') {
      console.log(`[login] sign-in code for ${email}: ${issued.code}`);
      return { status: 'sent', email };
    }

    if (!(await sendOne(email, signInCodeMessage(issued.code)))) {
      return {
        status: 'error',
        message: "We couldn't send a code just now. Please try again in a minute.",
      };
    }
    return { status: 'sent', email };
  } catch (err) {
    console.error('[login] could not send a code:', err);
    return {
      status: 'error',
      message: "We couldn't check the board list just now. Please try again.",
    };
  }
}

/** Checks the code and, if it is right, signs the member in on this browser. */
export async function verifyCode(rawEmail: string, rawCode: string): Promise<VerifyCodeResult> {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode ?? '').replace(/\D/g, '');
  if (!email) return { status: 'error', message: 'Enter your email again.' };
  if (code.length !== 8) return { status: 'error', message: 'Enter all 8 digits from the email.' };

  try {
    const result = await checkCode(email, code);
    if (!result.ok) {
      return {
        status: 'error',
        message:
          result.reason === 'expired'
            ? 'That code has expired, or a newer one was sent. Use the latest code, or send a new one.'
            : "That code didn't work. Check the digits and try again.",
      };
    }
    const member = await activeMember(email);
    if (!member) return { status: 'error', message: NOT_ON_LIST };
    await startSession(member.id, await requestContext());
    return { status: 'ok' };
  } catch (err) {
    console.error('[login] could not verify a code:', err);
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}
