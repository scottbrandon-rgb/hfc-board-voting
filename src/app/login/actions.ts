'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

const ALLOWLIST_ERROR =
  'That email is not authorized for the HFC Board Voting Platform. If you believe this is a mistake, contact Scott Brandon.';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    console.log('[login] action started');

    const rawEmail = formData.get('email');
    if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
      return { status: 'error', message: 'Please enter your email address.' };
    }
    const email = rawEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      return { status: 'error', message: 'Please enter a valid email address.' };
    }

    console.log('[login] checking allowlist for', email);

    // Sanity-check critical env vars at runtime
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[login] missing NEXT_PUBLIC_SUPABASE_URL');
      return { status: 'error', message: 'Server config error: missing Supabase URL. Contact admin.' };
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[login] missing SUPABASE_SERVICE_ROLE_KEY');
      return { status: 'error', message: 'Server config error: missing service role key. Contact admin.' };
    }

    const admin = createAdminClient();
    const { data: member, error: lookupError } = await admin
      .from('members')
      .select('id, email')
      .ilike('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (lookupError) {
      console.error('[login] allowlist lookup failed:', lookupError);
      return { status: 'error', message: `Lookup error: ${lookupError.message}` };
    }
    if (!member) {
      console.log('[login] not on allowlist:', email);
      return { status: 'error', message: ALLOWLIST_ERROR };
    }

    console.log('[login] allowlist OK, sending OTP');

    const headerList = await headers();
    const origin = headerList.get('origin') ?? process.env.APP_URL ?? 'http://localhost:3000';

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[login] signInWithOtp error:', error);
      return { status: 'error', message: `OTP error: ${error.message}` };
    }

    console.log('[login] OTP sent successfully to', email);
    return { status: 'sent', email };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error('[login] uncaught exception:', message, stack);
    return { status: 'error', message: `Server error: ${message}` };
  }
}
