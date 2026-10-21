import Link from 'next/link';
import { LinkPending } from '@/components/board/link-pending';
import { notFound } from 'next/navigation';
import { ChevronLeft, Clock, Download, FileText } from 'lucide-react';
import { requireMember, type CurrentMember } from '@/lib/dal';
import {
  getBoardSettings,
  getMotionDetail,
  type Ballot,
  type RosterEntry,
  type VoteSnapshot,
} from '@/lib/queries';
import { getPdfSignedUrl, PDF_STATUSES } from '@/lib/generate-pdf';
import {
  commentsOpen,
  inPersonResultLabel,
  isVotingRole,
  reasonLabel,
  referralReasonLabel,
  statusChip,
  voteLabel,
  votingChip,
  type BallotChoice,
  type StatusChipInfo,
} from '@/lib/rules';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatPlainDate,
  formatShort,
  timeLeft,
} from '@/lib/format';
import { Avatar, Card, Chip, StatusChip, UnanimityBar } from '@/components/board/ui';
import { AutoRefresh, UpdatedLabel } from '@/components/board/auto-refresh';
import { CallButton } from '@/components/board/call-button';
import { VoteButton } from './_components/vote-sheet';
import { ProcedureButton } from './_components/procedure-actions';
import { ExtendButton, ReferButton } from './_components/chair-tools';
import { DraftActions } from './_components/draft-actions';
import { CommentForm } from './_components/comment-form';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Motion' };

type Detail = NonNullable<Awaited<ReturnType<typeof getMotionDetail>>>;
type Motion = Detail['motion'];

function nameOf(roster: RosterEntry[], id: string | null | undefined): string | null {
  return id ? (roster.find((m) => m.id === id)?.full_name ?? 'Former board member') : null;
}

export default async function MotionPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;
  const detail = await getMotionDetail(id, member);
  if (!detail) notFound();

  const { motion, roster, attachments, comments, snapshot } = detail;
  const isChair = member.role === 'chair';
  const isCurrentRules = motion.rules === 'unanimous_v1';
  const canSeeRecord =
    (isChair || member.role === 'secretary') && PDF_STATUSES.includes(motion.status);
  const [pdfUrl, settings] = await Promise.all([
    canSeeRecord ? getPdfSignedUrl(motion.id) : Promise.resolve(null),
    getBoardSettings(),
  ]);

  const chip: StatusChipInfo =
    motion.status === 'voting'
      ? votingChip(snapshot.progress, snapshot.viewerNeedsToVote)
      : statusChip(motion.status);
  const showProgress =
    isCurrentRules &&
    ['voting', 'approved', 'referred', 'ratified', 'decided_in_person'].includes(motion.status) &&
    snapshot.electorate.length > 0;
  const showRollCall = snapshot.electorate.length > 0 || snapshot.ballots.length > 0;
  const meetingLabel = settings.next_meeting_at
    ? formatLongDate(settings.next_meeting_at)
    : 'the next meeting';

  const actionBar = renderActions({ motion, member, snapshot, roster, meetingLabel });

  return (
    <main
      className={cn(
        'mx-auto w-full max-w-5xl px-5 md:px-8 md:pt-6',
        actionBar ? 'pb-36 md:pb-0' : 'pb-8',
      )}
    >
      {/* Phone header */}
      <header className="bg-page/95 sticky top-0 z-20 -mx-5 flex h-14 items-center px-2 backdrop-blur md:hidden">
        <Link
          href="/"
          className="text-brand text-body flex h-11 items-center gap-0.5 px-2 font-medium"
        >
          <ChevronLeft className="size-5.5" aria-hidden="true" />
          Home
          <LinkPending />
        </Link>
        <span className="text-small text-ink-2 flex-1 pr-20 text-center font-semibold">
          {motion.motion_number}
        </span>
      </header>

      <nav aria-label="Breadcrumb" className="text-small text-ink-3 mb-4 hidden md:block">
        <Link href="/motions" className="text-brand">
          Motions
        </Link>{' '}
        / {motion.motion_number}
      </nav>

      <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-8">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-5 pt-2 md:pt-0">
          <section className="flex flex-col gap-2.5">
            <StatusChip info={chip} className="self-start" />
            <h1 className="text-heading font-bold tracking-tight md:text-[34px] md:leading-10">
              {motion.title}
            </h1>
            <StatusLine motion={motion} />
          </section>

          <Outcome motion={motion} roster={roster} />

          {showProgress && (
            <div className="md:hidden">
              <ProgressCard motion={motion} snapshot={snapshot} roster={roster} isChair={isChair} />
            </div>
          )}

          <section aria-labelledby="motion-text" className="flex flex-col gap-2.5">
            <h2 id="motion-text" className="text-body font-semibold">
              The motion
            </h2>
            <Card className="flex flex-col gap-3">
              <p className="text-body whitespace-pre-wrap">{motion.description}</p>
              {motion.background && (
                <div className="flex flex-col gap-1">
                  <h3 className="text-small text-ink-3 font-semibold">Background</h3>
                  <p className="text-body text-ink-2 whitespace-pre-wrap">{motion.background}</p>
                </div>
              )}
              <dl className="text-small grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pt-1">
                <dt className="text-ink-3">Proposed</dt>
                <dd>{nameOf(roster, motion.created_by) ?? 'The chair'}</dd>
                {motion.moved_by && (
                  <>
                    <dt className="text-ink-3">Moved</dt>
                    <dd>{nameOf(roster, motion.moved_by)}</dd>
                  </>
                )}
                {motion.seconded_by && (
                  <>
                    <dt className="text-ink-3">Seconded</dt>
                    <dd>{nameOf(roster, motion.seconded_by)}</dd>
                  </>
                )}
              </dl>
            </Card>
          </section>

          {attachments.length > 0 && (
            <section aria-labelledby="docs" className="flex flex-col gap-2.5">
              <h2 id="docs" className="text-body font-semibold">
                Documents
              </h2>
              <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
                {attachments.map((a) => (
                  <li key={a.id}>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-15 items-center gap-3 px-4 py-2.5"
                      >
                        <FileText className="text-ink-3 size-5.5 shrink-0" aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-medium">{a.file_name}</span>
                          <span className="text-caption text-ink-3">
                            {formatBytes(a.file_size)}
                          </span>
                        </span>
                        <span className="text-brand text-base font-semibold">View</span>
                      </a>
                    ) : (
                      <span className="text-small text-ink-3 flex min-h-15 items-center px-4">
                        {a.file_name} — unavailable right now
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showRollCall && (
            <div className="md:hidden">
              <RollCall motion={motion} snapshot={snapshot} roster={roster} viewer={member} />
            </div>
          )}

          {(comments.length > 0 || commentsOpen(motion.status)) && (
            <section
              id="discussion"
              aria-labelledby="discussion-heading"
              className="flex scroll-mt-16 flex-col gap-2.5"
            >
              <h2 id="discussion-heading" className="text-body font-semibold">
                Discussion
              </h2>
              <Card className="flex flex-col gap-4">
                {comments.length === 0 && <p className="text-small text-ink-3">No comments yet.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="flex flex-col gap-1">
                    <p className="text-small">
                      <span className="font-semibold">
                        {nameOf(roster, c.member_id) ?? 'Former board member'}
                      </span>{' '}
                      <span className="text-ink-3">· {formatShort(c.created_at)}</span>
                    </p>
                    <p className="text-base leading-6 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
                {commentsOpen(motion.status) && (
                  <div className="border-line border-t pt-4">
                    <CommentForm motionId={motion.id} />
                  </div>
                )}
              </Card>
            </section>
          )}

          {pdfUrl && (
            <a
              href={pdfUrl}
              className="border-line flex min-h-15 items-center gap-3 rounded-2xl border bg-white px-4 py-3 md:hidden"
            >
              <Download className="text-ink-3 size-5.5" aria-hidden="true" />
              <span className="flex-1 text-base font-semibold">Official record (PDF)</span>
            </a>
          )}

          <History motion={motion} snapshot={snapshot} roster={roster} />
        </div>

        {/* Side column: voting panel on desktop; on phones only the action bar shows, pinned to the bottom. */}
        <aside aria-label="Voting" className="flex flex-col gap-4 md:sticky md:top-6">
          {showProgress && (
            <div className="hidden md:block">
              <ProgressCard motion={motion} snapshot={snapshot} roster={roster} isChair={isChair} />
            </div>
          )}
          {showRollCall && (
            <div className="hidden md:block">
              <RollCall motion={motion} snapshot={snapshot} roster={roster} viewer={member} />
            </div>
          )}
          {actionBar && (
            <div className="border-line fixed inset-x-0 bottom-0 z-30 border-t bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:rounded-2xl md:border md:p-4">
              {actionBar}
            </div>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="border-line hidden min-h-14 items-center gap-3 rounded-2xl border bg-white px-4 md:flex"
            >
              <Download className="text-ink-3 size-5" aria-hidden="true" />
              <span className="flex-1 text-base font-semibold">Official record (PDF)</span>
            </a>
          )}
        </aside>
      </div>

      {['open', 'moved', 'voting'].includes(motion.status) && <AutoRefresh />}
    </main>
  );
}

// ─── Status line and outcome ─────────────────────────────────────────────────

function StatusLine({ motion }: { motion: Motion }) {
  if (motion.status === 'voting' && motion.voting_deadline) {
    return (
      <p className="text-small text-ink-2 flex items-center gap-2">
        <Clock className="size-4.5 shrink-0" aria-hidden="true" />
        Closes {formatDateTime(motion.voting_deadline)} · {timeLeft(motion.voting_deadline)}
      </p>
    );
  }
  if (motion.status === 'open') {
    return (
      <p className="text-small text-ink-2">
        Waiting for a voting member to move it. Voting opens once it is moved and seconded.
      </p>
    );
  }
  if (motion.status === 'moved') {
    return (
      <p className="text-small text-ink-2">
        Moved. Waiting for another voting member to second it; voting opens then.
      </p>
    );
  }
  if (motion.status === 'draft') {
    return (
      <p className="text-small text-ink-2">Draft — only the chair and secretary can see it.</p>
    );
  }
  if (motion.decided_at) {
    return <p className="text-small text-ink-3">Decided online {formatDate(motion.decided_at)}</p>;
  }
  return null;
}

function Outcome({ motion, roster }: { motion: Motion; roster: RosterEntry[] }) {
  if (motion.status === 'approved') {
    return (
      <Card className="bg-good-soft border-transparent">
        <p className="text-body text-good font-semibold">Approved unanimously online</p>
        <p className="text-small text-ink-2">
          Provisional until ratified at the next in-person meeting.
        </p>
      </Card>
    );
  }
  if (motion.status === 'ratified') {
    return (
      <Card className="bg-good-soft border-transparent">
        <p className="text-body text-good font-semibold">Ratified</p>
        <p className="text-small text-ink-2">
          {motion.meeting_date
            ? `At the meeting of ${formatPlainDate(motion.meeting_date)}`
            : 'At an in-person meeting'}
          {motion.ratified_by ? ` · recorded by ${nameOf(roster, motion.ratified_by)}` : ''}
        </p>
      </Card>
    );
  }
  if (motion.status === 'referred' || motion.status === 'decided_in_person') {
    return (
      <Card className="bg-warn-soft flex flex-col gap-1.5 border-transparent">
        <p className="text-body text-warn font-semibold">
          {motion.status === 'referred'
            ? 'Referred to the in-person meeting'
            : inPersonResultLabel(motion.in_person_result)}
        </p>
        <p className="text-small text-ink-2">{referralReasonLabel(motion.referral_reason)}.</p>
        {motion.referral_note && (
          <p className="text-small text-ink-2 rounded-lg bg-white/70 px-3 py-2">
            “{motion.referral_note}” — the chair
          </p>
        )}
        {motion.status === 'decided_in_person' && motion.meeting_date && (
          <p className="text-small text-ink-2">
            Meeting of {formatPlainDate(motion.meeting_date)}
            {motion.in_person_note ? `: ${motion.in_person_note}` : ''}
          </p>
        )}
        {motion.status === 'referred' && motion.in_person_note && (
          <p className="text-small text-ink-2">Postponed: {motion.in_person_note}</p>
        )}
      </Card>
    );
  }
  if (motion.status === 'withdrawn') {
    return (
      <Card>
        <p className="text-body font-semibold">Withdrawn by the member who moved it</p>
      </Card>
    );
  }
  if (motion.rules === 'legacy' && motion.status !== 'draft') {
    return (
      <Card className="bg-chip border-transparent">
        <p className="text-small text-ink-2">
          Decided under the board&apos;s previous voting rules.
        </p>
      </Card>
    );
  }
  return null;
}

// ─── Progress and roll call ──────────────────────────────────────────────────

function ProgressCard({
  motion,
  snapshot,
  roster,
  isChair,
}: {
  motion: Motion;
  snapshot: VoteSnapshot;
  roster: RosterEntry[];
  isChair: boolean;
}) {
  const p = snapshot.progress;
  const waiting = snapshot.electorate
    .filter((id) => !snapshot.ballots.some((b) => b.member_id === id))
    .map((id) => nameOf(roster, id)!);
  const isOpen = motion.status === 'voting';

  let line: string;
  if (!isOpen)
    line =
      p.ayes === p.electorate
        ? `All ${p.electorate} voted Aye.`
        : `${p.ayes} of ${p.electorate} voted Aye.`;
  else if (p.others > 0)
    line = `Headed to the in-person meeting unless ${p.others === 1 ? 'that member changes' : 'those members change'} to Aye${waiting.length ? ' and everyone else votes Aye' : ''} by the deadline.`;
  else if (waiting.length === 0) line = 'Everyone has voted.';
  else
    line = `Waiting on ${waiting.join(', ')}.${waiting.length === 1 ? ' If they vote Aye, the motion is approved immediately.' : ''}`;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body font-semibold">
          {p.ayes} of {p.electorate} Aye
          {p.others > 0 && <span className="text-warn"> · {p.others} discuss</span>}
        </span>
        <span className="text-caption text-ink-3">All {p.electorate} needed</span>
      </div>
      <UnanimityBar progress={p} thick />
      <p className="text-small text-ink-2">{line}</p>
      {isOpen && (
        <p className="text-caption text-ink-3">
          Approved when all {p.electorate} vote Aye. Anything else goes to the in-person meeting.
        </p>
      )}
      {isChair && isOpen && !motion.deadline_extended_at && motion.voting_deadline && (
        <ExtendButton
          motionId={motion.id}
          currentDeadline={formatDateTime(motion.voting_deadline)}
        />
      )}
      {motion.deadline_extended_at && (
        <p className="text-caption text-ink-3">
          Deadline extended
          {motion.deadline_extension_note ? `: “${motion.deadline_extension_note}”` : ''}
        </p>
      )}
    </Card>
  );
}

function BallotChip({ ballot }: { ballot: Ballot | undefined }) {
  if (!ballot) {
    return (
      <Chip tone="dashed" className="font-medium">
        Not yet voted
      </Chip>
    );
  }
  if (ballot.vote === 'aye')
    return (
      <Chip tone="good" icon="check">
        Aye
      </Chip>
    );
  if (ballot.vote === 'discuss')
    return (
      <Chip tone="warn" icon="message">
        Discuss in person
      </Chip>
    );
  return <Chip tone="neutral">{voteLabel(ballot.vote)}</Chip>;
}

function RollCall({
  motion,
  snapshot,
  roster,
  viewer,
}: {
  motion: Motion;
  snapshot: VoteSnapshot;
  roster: RosterEntry[];
  viewer: CurrentMember;
}) {
  const byMember = new Map(snapshot.ballots.map((b) => [b.member_id, b]));
  const ids =
    snapshot.electorate.length > 0 ? snapshot.electorate : snapshot.ballots.map((b) => b.member_id);
  const rows = ids
    .map((id) => ({
      id,
      name: nameOf(roster, id) ?? 'Former board member',
      ballot: byMember.get(id),
    }))
    .sort((a, b) => {
      // The viewer first, then by time voted, then members still to vote.
      if (a.id === viewer.id) return -1;
      if (b.id === viewer.id) return 1;
      if (a.ballot && b.ballot) return a.ballot.cast_at.localeCompare(b.ballot.cast_at);
      if (a.ballot) return -1;
      if (b.ballot) return 1;
      return a.name.localeCompare(b.name);
    });
  const closed = motion.status !== 'voting';

  return (
    <section aria-labelledby="votes-heading" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="votes-heading" className="text-body font-semibold">
          Votes
        </h2>
        {motion.status === 'voting' ? <UpdatedLabel /> : null}
      </div>
      <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
        {rows.map(({ id, name, ballot }) => {
          const reason = reasonLabel(ballot?.reason);
          const when = ballot ? (ballot.updated_at ?? ballot.cast_at) : null;
          return (
            <li key={id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={name} highlight={id === viewer.id} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      'truncate text-base',
                      id === viewer.id ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {name}
                    {id === viewer.id ? ' (you)' : ''}
                  </span>
                  <span className="text-caption text-ink-3">
                    {when
                      ? `${ballot && ballot.change_count > 0 ? 'Changed ' : ''}${formatShort(when)}`
                      : closed
                        ? 'Did not vote'
                        : motion.last_call_sent_at || motion.reminder_24h_sent_at
                          ? `Reminded ${formatShort((motion.last_call_sent_at ?? motion.reminder_24h_sent_at)!)}`
                          : 'Not yet voted'}
                  </span>
                </span>
                {closed && !ballot ? (
                  <Chip tone="neutral">Did not vote</Chip>
                ) : (
                  <BallotChip ballot={ballot} />
                )}
              </div>
              {(reason || ballot?.note) && (
                <p className="bg-page text-small text-ink-2 ml-12 rounded-lg px-3 py-2">
                  {reason && <span className="font-semibold">{reason}</span>}
                  {reason && ballot?.note ? ': ' : ''}
                  {ballot?.note && `“${ballot.note}”`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function renderActions({
  motion,
  member,
  snapshot,
  roster,
  meetingLabel,
}: {
  motion: Motion;
  member: CurrentMember;
  snapshot: VoteSnapshot;
  roster: RosterEntry[];
  meetingLabel: string;
}): React.ReactNode {
  const isChair = member.role === 'chair';
  const voter = isVotingRole(member.role);
  const p = snapshot.progress;
  const voteSummary =
    motion.status === 'voting' && p.ayes + p.others > 0
      ? `The ${[p.ayes ? `${p.ayes} Aye` : null, p.others ? `${p.others} Discuss in person` : null].filter(Boolean).join(' and ')} vote${p.ayes + p.others === 1 ? '' : 's'}`
      : null;

  if (motion.status === 'draft' && isChair) return <DraftActions motionId={motion.id} />;

  if (motion.status === 'open') {
    if (isChair) {
      return (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-1">
          <CallButton motionId={motion.id} label="Call for a motion" />
          <ReferButton
            className="w-full"
            motionId={motion.id}
            motionNumber={motion.motion_number}
            title={motion.title}
            voteSummary={null}
            meetingLabel={meetingLabel}
          />
        </div>
      );
    }
    if (voter) return <ProcedureButton motionId={motion.id} kind="move" />;
    return null;
  }

  if (motion.status === 'moved') {
    if (isChair) {
      return (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-1">
          <CallButton motionId={motion.id} label="Call for a second" />
          <ReferButton
            className="w-full"
            motionId={motion.id}
            motionNumber={motion.motion_number}
            title={motion.title}
            voteSummary={null}
            meetingLabel={meetingLabel}
          />
        </div>
      );
    }
    if (motion.moved_by === member.id)
      return <ProcedureButton motionId={motion.id} kind="withdraw" />;
    if (voter) return <ProcedureButton motionId={motion.id} kind="second" />;
    return null;
  }

  if (motion.status === 'voting') {
    if (isChair) {
      const waiting = snapshot.electorate.filter(
        (id) => !snapshot.ballots.some((b) => b.member_id === id),
      );
      const remindLabel =
        waiting.length === 1
          ? `Remind ${(nameOf(roster, waiting[0]) ?? 'member').split(' ')[0]}`
          : 'Remind';
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-1">
            {waiting.length > 0 ? (
              <CallButton motionId={motion.id} label={remindLabel} />
            ) : (
              <span className="text-small text-ink-3 flex items-center">Everyone has voted</span>
            )}
            <ReferButton
              className="w-full"
              motionId={motion.id}
              motionNumber={motion.motion_number}
              title={motion.title}
              voteSummary={voteSummary}
              meetingLabel={meetingLabel}
            />
          </div>
          <p className="text-caption text-ink-3">As chair, you don&apos;t vote online.</p>
        </div>
      );
    }
    if (snapshot.electorate.includes(member.id) && voter) {
      const mine = snapshot.mine;
      return (
        <VoteButton
          motionId={motion.id}
          motionNumber={motion.motion_number}
          title={motion.title}
          deadlineLabel={
            motion.voting_deadline ? formatDateTime(motion.voting_deadline) : 'the deadline'
          }
          mine={{
            choice:
              mine && (mine.vote === 'aye' || mine.vote === 'discuss')
                ? (mine.vote as BallotChoice)
                : null,
            reason: mine?.reason ?? null,
            note: mine?.note ?? null,
            legacy:
              mine && mine.vote !== 'aye' && mine.vote !== 'discuss' ? voteLabel(mine.vote) : null,
          }}
        />
      );
    }
    return null;
  }

  return null;
}

// ─── History ─────────────────────────────────────────────────────────────────

function History({
  motion,
  snapshot,
  roster,
}: {
  motion: Motion;
  snapshot: VoteSnapshot;
  roster: RosterEntry[];
}) {
  const events: { at: string; label: string }[] = [];
  const add = (at: string | null, label: string) => at && events.push({ at, label });

  add(motion.created_at, `Drafted by ${nameOf(roster, motion.created_by) ?? 'the chair'}`);
  add(motion.published_at, 'Published to the board');
  add(motion.moved_at, `Moved by ${nameOf(roster, motion.moved_by)}`);
  add(motion.seconded_at, `Seconded by ${nameOf(roster, motion.seconded_by)}`);
  add(motion.voting_opened_at, 'Voting opened');
  for (const b of snapshot.ballots) {
    add(b.cast_at, `${nameOf(roster, b.member_id)} voted`);
    if (b.updated_at && b.change_count > 0)
      add(b.updated_at, `${nameOf(roster, b.member_id)} changed their vote`);
  }
  add(motion.deadline_extended_at, 'Deadline extended');
  add(motion.withdrawn_at, 'Withdrawn');
  if (motion.status === 'approved' || motion.status === 'ratified')
    add(motion.decided_at, 'Approved');
  add(motion.referred_at, 'Referred to the in-person meeting');
  add(motion.ratified_at, 'Ratified');
  add(motion.in_person_recorded_at, 'Meeting outcome recorded');

  events.sort((a, b) => a.at.localeCompare(b.at));
  if (events.length === 0) return null;

  return (
    <details className="border-line rounded-2xl border bg-white">
      <summary className="flex min-h-14 cursor-pointer items-center px-4 text-base font-semibold">
        History
      </summary>
      <ol className="flex flex-col gap-2 px-4 pb-4">
        {events.map((e, i) => (
          <li key={i} className="text-small flex gap-3">
            <span className="text-ink-3 w-28 shrink-0 tabular-nums">{formatShort(e.at)}</span>
            <span>{e.label}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
