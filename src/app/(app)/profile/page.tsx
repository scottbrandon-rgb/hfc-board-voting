import Link from 'next/link';
import { ChevronRight, LogOut, Users } from 'lucide-react';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS, isVotingRole } from '@/lib/rules';
import { Card, PageTitle, SectionHeading } from '@/components/board/ui';
import { MobileBrand } from '@/components/board/nav';
import { InstallRow } from '@/components/board/install';
import { EditNameForm } from './edit-name-form';
import { NotificationSettings } from './notification-settings';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const member = await requireMember();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from('members')
    .select('notify_new_motions, notify_comments, notify_results')
    .eq('id', member.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-4 md:px-8 md:pt-8">
      <MobileBrand />
      <PageTitle>Profile</PageTitle>

      <Card className="flex flex-col gap-1">
        <EditNameForm currentName={member.full_name} />
        <div className="border-line flex flex-col border-t pt-3">
          <span className="text-caption text-ink-3">Email</span>
          <span className="text-body [overflow-wrap:anywhere]">{member.email}</span>
        </div>
        <div className="border-line mt-2 flex flex-col border-t pt-3">
          <span className="text-caption text-ink-3">Role</span>
          <span className="text-body">
            {ROLE_LABELS[member.role]}
            {isVotingRole(member.role)
              ? ' · votes online'
              : ' · leads the board; does not vote online'}
          </span>
        </div>
      </Card>

      {member.role === 'chair' && (
        <Link
          href="/admin/members"
          className="border-line focus-visible:ring-brand/40 flex min-h-[72px] items-center gap-3.5 rounded-2xl border bg-white px-4 py-3 outline-none focus-visible:ring-3"
        >
          <span className="bg-brand-soft text-brand flex size-11 items-center justify-center rounded-full">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-body font-semibold">Board members</span>
            <span className="text-small text-ink-2">Add, retire and change roles</span>
          </span>
          <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
        </Link>
      )}

      <section aria-labelledby="email-settings" className="flex flex-col gap-3">
        <SectionHeading id="email-settings">Email me about</SectionHeading>
        <Card className="py-1">
          <NotificationSettings
            initial={{
              notify_new_motions: prefs?.notify_new_motions ?? true,
              notify_comments: prefs?.notify_comments ?? true,
              notify_results: prefs?.notify_results ?? true,
            }}
          />
        </Card>
      </section>

      <section aria-labelledby="this-device" className="flex flex-col gap-3">
        <SectionHeading id="this-device">This device</SectionHeading>
        <InstallRow />
      </section>

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="border-line text-danger focus-visible:ring-brand/40 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border bg-white text-base font-semibold outline-none focus-visible:ring-3"
        >
          <LogOut className="size-5" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </main>
  );
}
