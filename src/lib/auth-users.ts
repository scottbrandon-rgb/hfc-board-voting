import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Makes sure a board member has a sign-in account. Sign-in codes are requested
 * with `shouldCreateUser: false`, so nobody outside the board list can create
 * an account by asking for a code; accounts are created here instead, when the
 * chair adds a member or the member first signs in.
 */
export async function ensureAuthUser(email: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!error) return;
  // Already has an account: nothing to do.
  if (error.code === 'email_exists' || error.status === 422 || /already/i.test(error.message))
    return;
  console.error('[auth] could not create sign-in account:', error.message);
}
