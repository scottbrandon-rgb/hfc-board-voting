'use server';

import { headers } from 'next/headers';
import {
  findActiveMember,
  issueCode,
  startSession,
  verifyCode,
  withdrawLatestCode,
} from '@/lib/auth';
import { sendSignInCode } from '@/lib/email';

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string } // code emailed — the browser asks for it
  | { status: 'error'; message: string };

const NOT_ON_LIST =
  "That email isn't on the Deacon Board list. Check the spelling, or ask the chair to add you.";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Checks the board list and emails an 8-digit sign-in code. */
export async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get('email');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { status: 'error', message: 'Enter your email address.' };
  }
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }

  try {
    const member = await findActiveMember(email);
    if (!member) return { status: 'error', message: NOT_ON_LIST };

    const issued = await issueCode(member.id);
    if (!issued.ok) {
      return {
        status: 'error',
        message:
          issued.reason === 'wait'
            ? 'A code was sent a moment ago. Wait a minute, then try again.'
            : 'Several codes were sent in the last hour. Use the newest one, or wait an hour and try again.',
      };
    }

    if (!(await sendSignInCode(member.email, issued.code))) {
      // Not sent, so it should not count against the member's hourly limit.
      await withdrawLatestCode(member.id);
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

export type VerifyState = { ok: true } | { ok: false; message: string };

/** Checks the code and, if it is right, signs this browser in. */
export async function signInWithCode(email: string, code: string): Promise<VerifyState> {
  try {
    const result = await verifyCode(email, code);
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === 'expired'
            ? 'That code has expired, or a newer one was sent. Use the latest code, or send a new one.'
            : result.reason === 'too_many'
              ? 'Too many tries with that code. Send a new code.'
              : "That code didn't work. Check the digits and try again.",
      };
    }
    await startSession(result.memberId, (await headers()).get('user-agent'));
    return { ok: true };
  } catch (err) {
    console.error('[login] sign-in failed:', err);
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}
