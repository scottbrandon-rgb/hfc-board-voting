import Link from 'next/link';
import { ChevronRight, User } from 'lucide-react';
import { requireChair } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { isVotingRole, type Role } from '@/lib/rules';
import { Card, EmptyState, PageTitle, SectionHeading } from '@/components/board/ui';
import { MobileBrand } from '@/components/board/nav';
import { AddMemberButton } from './_components/add-member-form';
import { MemberRow, type MemberRowData } from './_components/member-sheet';

export const metadata = { title: 'Board' };

const ROLE_ORDER: Record<Role, number> = { chair: 0, secretary: 1, member: 2 };

/** The bylaws seat five voting members plus the chair. */
const VOTING_SEATS = 5;

export default async function BoardPage() {
  const me = await requireChair();
  const admin = createAdminClient();
  const { data } = await admin.from('members').select('id, full_name, email, role, is_active');

  const members = ((data ?? []) as MemberRowData[]).sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.full_name.localeCompare(b.full_name),
  );
  const active = members.filter((m) => m.is_active);
  const retired = members.filter((m) => !m.is_active);
  const voting = active.filter((m) => isVotingRole(m.role)).length;

  const seatNote =
    voting < 3
      ? 'Fewer than three voting members: online votes cannot open (no quorum).'
      : voting < VOTING_SEATS
        ? `${VOTING_SEATS - voting} voting seat${VOTING_SEATS - voting === 1 ? ' is' : 's are'} vacant. Online approval needs an Aye from every seated voting member.`
        : voting > VOTING_SEATS
          ? `More than ${VOTING_SEATS} voting members are active. The bylaws seat five; retire anyone who has left.`
          : 'All five voting seats are filled.';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-4 md:px-8 md:pt-8">
      <MobileBrand />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle subtitle={`${voting} voting member${voting === 1 ? '' : 's'} plus the chair`}>
          Board
        </PageTitle>
        <AddMemberButton />
      </div>

      <p
        className={
          voting === VOTING_SEATS
            ? 'bg-good-soft text-good text-small rounded-xl px-4 py-3 font-medium'
            : 'bg-warn-soft text-warn text-small rounded-xl px-4 py-3 font-medium'
        }
      >
        {seatNote}
      </p>

      <section aria-labelledby="active" className="flex flex-col gap-3">
        <SectionHeading id="active">Active</SectionHeading>
        {active.length === 0 ? (
          <EmptyState>No active members.</EmptyState>
        ) : (
          <Card className="divide-line divide-y p-0">
            {active.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === me.id} />
            ))}
          </Card>
        )}
      </section>

      {retired.length > 0 && (
        <section aria-labelledby="retired" className="flex flex-col gap-3">
          <SectionHeading id="retired">Retired</SectionHeading>
          <Card className="divide-line divide-y p-0">
            {retired.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={false} />
            ))}
          </Card>
        </section>
      )}

      <Link
        href="/profile"
        className="border-line focus-visible:ring-brand/40 flex min-h-[72px] items-center gap-3.5 rounded-2xl border bg-white px-4 py-3 outline-none focus-visible:ring-3 md:hidden"
      >
        <span className="bg-chip text-ink-2 flex size-11 items-center justify-center rounded-full">
          <User className="size-5" aria-hidden="true" />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-body font-semibold">Your profile</span>
          <span className="text-small text-ink-2">Name, email settings, sign out</span>
        </span>
        <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
      </Link>
    </main>
  );
}
