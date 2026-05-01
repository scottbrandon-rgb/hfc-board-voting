'use server';

import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';

export type ProfileState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

export async function updateDisplayName(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const member = await requireMember();

  const name = (formData.get('full_name') as string | null)?.trim() ?? '';
  if (!name) return { status: 'error', message: 'Name cannot be empty.' };
  if (name.length > 80) return { status: 'error', message: 'Name must be 80 characters or fewer.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('members')
    .update({ full_name: name })
    .eq('id', member.id);

  if (error) return { status: 'error', message: `Could not update name: ${error.message}` };

  revalidatePath('/profile');
  revalidatePath('/');        // refresh header avatar initial
  return { status: 'success' };
}
