import Link from 'next/link';
import { CalendarDays, ChevronRight, Clock, Plus } from 'lucide-react';
import { requireMember, type CurrentMember } from '@/lib/dal';
import {
  getHomeData,
  type HomeData,
  type MotionSummary,
  type RosterEntry,
  type VoteSnapshot,
} from '@/lib/queries';
import {
  closingWithin,
  firstName,
  formatDateTime,
  formatShort,
  greeting,
  timeLeft,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { isVotingRole, progressSummary, reasonLabel, statusChip, votingChip } from '@/lib/rules';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  Chip,
  EmptyState,
  MotionLinkCard,
  PageTitle,
  SectionHeading,
  StatusChip,
  UnanimityBar,
} from '@/components/board/ui';
import { MobileBrand } from '@/components/board/nav';
import { InstallCard } from '@/components/board/install';
import { AutoRefresh } from '@/components/board/auto-refresh';
import { CallButton } from '@/components/board/call-button';

export const metadata = { title: 'Home' };

function nameOf(roster: RosterEntry[], id: string | null | undefined): string {
  return roster.find((m) => m.id === id)?.full_name ?? 'A member';
}

function waitingNames(snapshot: VoteSnapshot, roster: RosterEntry[]): string[] {
  const voted = new Set(snapshot.ballots.map((b) => b.member_id));
  return snapshot.electorate.filter((id) => !voted.has(id)).map((id) => nameOf(roster, id));
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default async function HomePage() {
  const member = await requireMember();
  const data = await getHomeData(member);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-4 md:px-8 md:pt-8">
      {member.role === 'chair' ? (
        <ChairHome member={member} data={data} />
      ) : (
        <MemberHome member={member} data={data} />
      )}
      <NextMeetingCard data={data} />
      <AutoRefresh />
    </main>
  );
}

// ─── Member ──────────────────────────────────────────────────────────────────

function MemberHome({ member, data }: { member: CurrentMember; data: HomeData }) {
  const voting = data.inProgress.filter((m) => m.status === 'voting');
  const needsVote = voting.filter((m) => data.snapshots.get(m.id)?.viewerNeedsToVote);
  const otherVotes = voting.filter((m) => !data.snapshots.get(m.id)?.viewerNeedsToVote);
  const canAct = isVotingRole(member.role)
    ? data.inProgress.filter(
        (m) => m.status === 'open' || (m.status === 'moved' && m.moved_by !== member.id),
      )
    : [];

  const subtitle =
    needsVote.length === 0
      ? "You're all caught up."
      : needsVote.length === 1
        ? '1 motion needs your vote.'
        : `${needsVote.length} motions need your vote.`;

  return (
    <>
      <MobileBrand />
      <PageTitle subtitle={subtitle}>
        {greeting()}, {firstName(member.full_name)}
      </PageTitle>
      <InstallCard />

      {needsVote.length > 0 && (
        <section aria-labelledby="needs" className="flex flex-col gap-3">
          <SectionHeading id="needs">Needs your vote</SectionHeading>
          {needsVote.map((m) => (
            <VoteNeededCard key={m.id} motion={m} snapshot={data.snapshots.get(m.id)!} />
          ))}
        </section>
      )}

      {canAct.length > 0 && (
        <section aria-labelledby="act" className="flex flex-col gap-3">
          <SectionHeading id="act">Waiting for a motion or a second</SectionHeading>
          {canAct.map((m) => (
            <MotionLinkCard
              key={m.id}
              href={`/motions/${m.id}`}
              chip={<StatusChip info={statusChip(m.status)} />}
              number={m.motion_number}
              title={m.title}
              detail={
                m.status === 'open'
                  ? 'Any voting member can move it.'
                  : `Moved by ${nameOf(data.roster, m.moved_by)}. Second it to open voting.`
              }
            />
          ))}
        </section>
      )}

      {otherVotes.length > 0 && (
        <section aria-labelledby="open" className="flex flex-col gap-3">
          <SectionHeading
            id="open"
            action={
              <Link href="/motions" className="text-brand py-2 text-base font-semibold">
                See all
              </Link>
            }
          >
            {needsVote.length > 0 ? 'Other open votes' : 'Open votes'}
          </SectionHeading>
          {otherVotes.map((m) => {
            const s = data.snapshots.get(m.id)!;
            const mine = s.mine
              ? `You chose ${s.mine.vote === 'aye' ? 'Aye' : 'Discuss in person'}`
              : null;
            return (
              <MotionLinkCard
                key={m.id}
                href={`/motions/${m.id}`}
                chip={<StatusChip info={votingChip(s.progress, false)} />}
                number={m.motion_number}
                title={m.title}
                detail={[progressSummary(s.progress), mine].filter(Boolean).join(' · ')}
              />
            );
          })}
        </section>
      )}

      {needsVote.length === 0 && canAct.length === 0 && otherVotes.length === 0 && (
        <EmptyState>No motions are open right now. You&apos;re all caught up.</EmptyState>
      )}
    </>
  );
}

function VoteNeededCard({ motion, snapshot }: { motion: MotionSummary; snapshot: VoteSnapshot }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Chip tone="brand-solid">Your vote needed</Chip>
        <span className="text-caption text-ink-3">{motion.motion_number}</span>
      </div>
      <h3 className="text-title font-semibold">{motion.title}</h3>
      {motion.voting_deadline && (
        <p className="text-small text-ink-2 flex items-center gap-2">
          <Clock className="size-4.5" aria-hidden="true" />
          Closes {formatDateTime(motion.voting_deadline)} · {timeLeft(motion.voting_deadline)}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <UnanimityBar progress={snapshot.progress} />
        <p className="text-small text-ink-2">{progressSummary(snapshot.progress)}</p>
      </div>
      <Link
        href={`/motions/${motion.id}`}
        className={buttonVariants({ size: 'lg', className: 'w-full' })}
      >
        Review and vote
      </Link>
    </Card>
  );
}

// ─── Chair ───────────────────────────────────────────────────────────────────

function ChairHome({ member, data }: { member: CurrentMember; data: HomeData }) {
  const voting = data.inProgress.filter((m) => m.status === 'voting');

  const closingSoon = voting.filter((m) => {
    const s = data.snapshots.get(m.id)!;
    return (
      m.voting_deadline &&
      closingWithin(m.voting_deadline, 24) &&
      s.progress.waiting > 0 &&
      s.progress.others === 0
    );
  });
  const askedToDiscuss = voting.filter((m) => data.snapshots.get(m.id)!.progress.others > 0);
  const waitingForAction = data.inProgress.filter(
    (m) => m.status === 'open' || m.status === 'moved',
  );
  const attention = closingSoon.length + askedToDiscuss.length + waitingForAction.length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 md:hidden">
        <MobileBrand />
        <Link href="/motions/new" className={buttonVariants({ size: 'sm' })}>
          <Plus aria-hidden="true" />
          New motion
        </Link>
      </div>
      <div className="flex items-end justify-between gap-4">
        <PageTitle
          subtitle={`${voting.length} open vote${voting.length === 1 ? '' : 's'} · ${
            attention === 0
              ? 'nothing needs you'
              : `${attention} need${attention === 1 ? 's' : ''} your attention`
          }`}
        >
          {greeting()}, {firstName(member.full_name)}
        </PageTitle>
        <Link href="/motions/new" className={cn(buttonVariants(), 'hidden md:inline-flex')}>
          <Plus aria-hidden="true" />
          New motion
        </Link>
      </div>

      {attention > 0 && (
        <section aria-labelledby="attention" className="flex flex-col gap-3">
          <SectionHeading id="attention">Needs your attention</SectionHeading>

          {closingSoon.map((m) => {
            const s = data.snapshots.get(m.id)!;
            const names = waitingNames(s, data.roster);
            return (
              <Card key={m.id} className="flex flex-col gap-2.5">
                <p className="text-caption text-ink-2 flex items-center gap-2 font-semibold">
                  <Clock className="size-4" aria-hidden="true" />
                  Closes in {timeLeft(m.voting_deadline!).replace(' left', '')}
                </p>
                <Link href={`/motions/${m.id}`} className="text-body font-semibold">
                  {m.title}
                </Link>
                <p className="text-small text-ink-2">
                  {s.progress.ayes} of {s.progress.electorate} Aye · Waiting on {joinNames(names)}
                </p>
                <CallButton
                  motionId={m.id}
                  label={
                    names.length === 1
                      ? `Remind ${firstName(names[0])}`
                      : 'Remind members who haven’t voted'
                  }
                />
              </Card>
            );
          })}

          {askedToDiscuss.map((m) => {
            const s = data.snapshots.get(m.id)!;
            const first = s.ballots.find(
              (b) => b.vote !== 'aye' && s.electorate.includes(b.member_id),
            );
            const reason = reasonLabel(first?.reason);
            return (
              <Card key={m.id} className="flex flex-col gap-2.5">
                <Chip tone="warn" icon="message" className="self-start">
                  Asked to discuss
                </Chip>
                <span className="text-body font-semibold">{m.title}</span>
                {first && (
                  <p className="text-small text-ink-2">
                    {nameOf(data.roster, first.member_id)}
                    {reason ? ` · ${reason}` : ''}
                    {first.note ? `: “${first.note}”` : ''}
                  </p>
                )}
                <Link
                  href={`/motions/${m.id}`}
                  className={buttonVariants({ variant: 'secondary', className: 'w-full' })}
                >
                  Review
                </Link>
              </Card>
            );
          })}

          {waitingForAction.map((m) => (
            <Card key={m.id} className="flex flex-col gap-2.5">
              <StatusChip info={statusChip(m.status)} className="self-start" />
              <Link href={`/motions/${m.id}`} className="text-body font-semibold">
                {m.title}
              </Link>
              <p className="text-small text-ink-2">
                {m.status === 'open'
                  ? `Published ${m.published_at ? formatShort(m.published_at) : ''}`
                  : `Moved by ${nameOf(data.roster, m.moved_by)}${m.moved_at ? ` · ${formatShort(m.moved_at)}` : ''}`}
              </p>
              <CallButton
                motionId={m.id}
                label={m.status === 'open' ? 'Call for a motion' : 'Call for a second'}
              />
            </Card>
          ))}
        </section>
      )}

      <section aria-labelledby="votes" className="flex flex-col gap-3">
        <SectionHeading
          id="votes"
          action={
            <Link href="/motions" className="text-brand py-2 text-base font-semibold">
              All motions
            </Link>
          }
        >
          Open votes
        </SectionHeading>
        {voting.length === 0 ? (
          <EmptyState>No votes are open.</EmptyState>
        ) : (
          <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
            {voting.map((m) => {
              const s = data.snapshots.get(m.id)!;
              return (
                <li key={m.id}>
                  <Link href={`/motions/${m.id}`} className="flex flex-col gap-2 px-4 py-3.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-base font-semibold">{m.title}</span>
                      <span
                        className={`text-caption shrink-0 ${s.progress.others ? 'text-warn font-semibold' : 'text-ink-3'}`}
                      >
                        {s.progress.others
                          ? 'Headed to meeting'
                          : `${s.progress.ayes} of ${s.progress.electorate}${m.voting_deadline ? ` · ${timeLeft(m.voting_deadline)}` : ''}`}
                      </span>
                    </span>
                    <UnanimityBar progress={s.progress} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.drafts.length > 0 && (
        <section aria-labelledby="drafts" className="flex flex-col gap-3">
          <SectionHeading id="drafts">Drafts</SectionHeading>
          <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
            {data.drafts.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/motions/${m.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-semibold">{m.title}</span>
                    <span className="text-caption text-ink-3">{m.motion_number}</span>
                  </span>
                  <span className="text-brand text-base font-semibold">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function NextMeetingCard({ data }: { data: HomeData }) {
  const when = data.settings.next_meeting_at;
  return (
    <Link
      href="/meeting"
      className="border-line flex items-center gap-3.5 rounded-2xl border bg-white p-4"
    >
      <span
        aria-hidden="true"
        className="bg-brand-soft text-brand flex size-11 shrink-0 items-center justify-center rounded-xl"
      >
        <CalendarDays className="size-5.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold">Next in-person meeting</span>
        <span className="text-small text-ink-2">
          {when ? formatDateTime(when) : 'Date not set yet'} · {data.agendaCount} to discuss ·{' '}
          {data.toRatifyCount} to ratify
        </span>
      </span>
      <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
    </Link>
  );
}
