'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type LoginState =
  | { status: 'idle' }
  | { status: 'allowed'; email: string }   // allowlist OK — client will send OTP
  | { status: 'sent'; email: string }       // OTP sent (set by client after success)
  | { status: 'error'; message: string };

const ALLOWLIST_ERROR =
  'That email is not authorized for the Harrison Faith Board Voting. If you believe this is a mistake, contact Scott Brandon.';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Server action: validates email format and checks the members allowlist.
 * Does NOT call signInWithOtp — that happens client-side so the browser owns
 * the PKCE code verifier, ensuring the magic link works when clicked.
 */
export async function checkAllowlist(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get('email');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { status: 'error', message: 'Please enter your email address.' };
  }
  const email = rawEmail.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { status: 'error', message: 'Please enter a valid email address.' };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[login] missing SUPABASE_SERVICE_ROLE_KEY');
    return { status: 'error', message: 'Server configuration error. Contact admin.' };
  }

  const admin = createAdminClient();
  const { data: member, error: lookupError } = await admin
    .from('members')
    .select('id')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (lookupError) {
    console.error('[login] allowlist lookup failed:', lookupError);
    return { status: 'error', message: `Lookup error: ${lookupError.message}` };
  }
  if (!member) {
    return { status: 'error', message: ALLOWLIST_ERROR };
  }

  // Email is on the allowlist — client will call signInWithOtp
  return { status: 'allowed', email };
}
