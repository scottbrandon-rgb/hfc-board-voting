'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type LoginState =
  | { status: 'idle' }
  | { status: 'allowed'; email: string }
  | { status: 'error'; message: string };

const ALLOWLIST_ERROR =
  'That email is not authorized for the HFC Board Voting Platform. If you believe this is a mistake, contact Scott Brandon.';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Server action: verify the email is in the active members allowlist.
 * Does NOT call signInWithOtp — that happens client-side so the browser
 * owns the PKCE code verifier from the start.
 */
export async function checkEmailAllowlist(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get('email');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { status: 'error', message: 'Please enter your email address.' };
  }
  const email = rawEmail.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { status: 'error', message: 'Please enter a valid email address.' };
  }

  const admin = createAdminClient();
  const { data: member, error: lookupError } = await admin
    .from('members')
    .select('id')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (lookupError) {
    return { status: 'error', message: 'Could not verify your email. Please try again.' };
  }
  if (!member) {
    return { status: 'error', message: ALLOWLIST_ERROR };
  }

  return { status: 'allowed', email };
}
