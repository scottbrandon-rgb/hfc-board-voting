'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { escapeLike } from '@/lib/utils';
import { ensureAuthUser } from '@/lib/auth-users';

export type LoginState =
  | { status: 'idle' }
  | { status: 'allowed'; email: string } // on the board list — the browser asks for the code
  | { status: 'error'; message: string };

const NOT_ON_LIST =
  "That email isn't on the Deacon Board list. Check the spelling, or ask the chair to add you.";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Checks the board list. The code itself is requested from the browser so the
 * browser holds the sign-in session; this step makes sure the member has a
 * sign-in account first, because the browser may not create one.
 */
export async function checkAllowlist(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get('email');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { status: 'error', message: 'Enter your email address.' };
  }
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }

  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from('members')
    .select('id')
    .ilike('email', escapeLike(email))
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[login] board list lookup failed:', error);
    return {
      status: 'error',
      message: "We couldn't check the board list just now. Please try again.",
    };
  }
  if (!member) return { status: 'error', message: NOT_ON_LIST };

  await ensureAuthUser(email);
  return { status: 'allowed', email };
}
