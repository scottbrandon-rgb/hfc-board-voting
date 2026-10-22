'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireChairOrSecretary, requestContext, friendlyError } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { boardLocalToIso } from '@/lib/format';
import { notifyRatified } from '@/lib/notify';
import { generateAndStorePdf } from '@/lib/generate-pdf';

export type MeetingState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath('/meeting');
  revalidatePath('/');
  revalidatePath('/motions');
}

export async function setNextMeeting(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const member = await requireChairOrSecretary();
  const when = String(formData.get('when') ?? '');
  const location = String(formData.get('location') ?? '')
    .trim()
    .slice(0, 200);

  const iso = when ? boardLocalToIso(when) : null;
  if (when && !iso) return { status: 'error', message: 'Enter a valid date and time.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('board_settings')
    .update({
      next_meeting_at: iso,
      next_meeting_location: location || null,
      updated_at: new Date().toISOString(),
      updated_by: member.id,
    })
    .eq('id', true);
  if (error) return { status: 'error', message: friendlyError(error) };

  await admin.from('audit_log').insert({
    member_id: member.id,
    event_type: 'meeting_scheduled',
    event_data: { next_meeting_at: iso, location: location || null },
  });
  refresh();
  return { status: 'success', message: 'Meeting saved.' };
}

export async function ratifyMotions(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const member = await requireChairOrSecretary();
  const ids = formData.getAll('motion').map(String).filter(Boolean);
  const meetingDate = String(formData.get('meeting_date') ?? '');
  if (ids.length === 0) return { status: 'error', message: 'Select at least one motion.' };
  if (!DATE.test(meetingDate)) return { status: 'error', message: 'Enter the meeting date.' };

  const admin = createAdminClient();
  const { data: count, error } = await admin.rpc('vote_ratify', {
    p_motion_ids: ids,
    p_member_id: member.id,
    p_meeting_date: meetingDate,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  after(async () => {
    await notifyRatified(ids);
    for (const id of ids) {
      await generateAndStorePdf(id).catch((err) => console.error('[pdf] generation failed:', err));
    }
  });
  refresh();
  return { status: 'success', message: `${count ?? ids.length} ratified.` };
}

export async function recordOutcome(
  motionId: string,
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const member = await requireChairOrSecretary();
  const result = String(formData.get('result') ?? '');
  const meetingDate = String(formData.get('meeting_date') ?? '');
  const note = String(formData.get('note') ?? '')
    .trim()
    .slice(0, 1000);
  if (!['adopted', 'not_adopted', 'postponed'].includes(result)) {
    return { status: 'error', message: 'Choose Adopted, Not adopted, or Postponed.' };
  }
  if (!DATE.test(meetingDate)) return { status: 'error', message: 'Enter the meeting date.' };

  const admin = createAdminClient();
  const { error } = await admin.rpc('vote_record_in_person', {
    p_motion_id: motionId,
    p_member_id: member.id,
    p_result: result,
    p_meeting_date: meetingDate,
    p_note: note || null,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  if (result !== 'postponed') {
    after(() =>
      generateAndStorePdf(motionId).catch((err) => console.error('[pdf] generation failed:', err)),
    );
  }
  revalidatePath(`/motions/${motionId}`);
  refresh();
  return {
    status: 'success',
    message: result === 'postponed' ? 'Kept on the agenda.' : 'Outcome recorded.',
  };
}
