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
  const rawEmail = formData.get('email');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { status: 'error', message: 'Please enter your email address.' };
  }
  const email = rawEmail.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { status: 'error', message: 'Please enter a valid email address.' };
  }

  // Allowlist check via the service role so the lookup happens regardless of
  // any existing session. Members with is_active = false are excluded.
  const admin = createAdminClient();
  const { data: member, error: lookupError } = await admin
    .from('members')
    .select('id, email')
    .ilike('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (lookupError) {
    return { status: 'error', message: 'Could not verify your email. Please try again.' };
  }
  if (!member) {
    return { status: 'error', message: ALLOWLIST_ERROR };
  }

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
    return { status: 'error', message: error.message };
  }

  return { status: 'sent', email };
}
