import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { getMeetingData, type RosterEntry } from '@/lib/queries';
import {
  formatDate,
  formatDateTime,
  isoToBoardLocal,
  timeLeft,
  todayInBoardTz,
} from '@/lib/format';
import { reasonLabel, referralReasonLabel, statusChip } from '@/lib/rules';
import { Card, Chip, EmptyState, PageTitle, SectionHeading } from '@/components/board/ui';
import { MobileBrand } from '@/components/board/nav';
import { AutoRefresh } from '@/components/board/auto-refresh';
import { OutcomeButton, PrintButton, RatifyForm, SetMeetingButton } from './meeting-tools';

export const metadata = { title: 'Next meeting' };

function nameOf(roster: RosterEntry[], id: string | null | undefined): string {
  return roster.find((m) => m.id === id)?.full_name ?? 'A member';
}

export default async function MeetingPage() {
  const member = await requireMember();
  const data = await getMeetingData(member);
  const canRecord = member.role === 'chair' || member.role === 'secretary';
  const when = data.settings.next_meeting_at;
  const meetingDay = when ? isoToBoardLocal(when).slice(0, 10) : todayInBoardTz();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-4 md:px-8 md:pt-8">
      <MobileBrand />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          subtitle={
            when
              ? `${formatDateTime(when)}${data.settings.next_meeting_location ? ` · ${data.settings.next_meeting_location}` : ''}`
              : 'The date has not been set yet.'
          }
        >
          Next meeting
        </PageTitle>
        {canRecord && (
          <div className="flex gap-2 print:hidden">
            <SetMeetingButton
              when={when ? isoToBoardLocal(when) : ''}
              location={data.settings.next_meeting_location ?? ''}
            />
            <PrintButton />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col">
          <span className="text-[28px] leading-9 font-bold">{data.agenda.length}</span>
          <span className="text-small text-ink-2">To discuss</span>
        </Card>
        <Card className="flex flex-col">
          <span className="text-[28px] leading-9 font-bold">{data.toRatify.length}</span>
          <span className="text-small text-ink-2">To ratify</span>
        </Card>
      </div>

      <section aria-labelledby="discuss" className="flex flex-col gap-3">
        <SectionHeading id="discuss">To discuss</SectionHeading>
        {data.agenda.length === 0 && (
          <EmptyState>Nothing has been referred to the meeting.</EmptyState>
        )}
        {data.agenda.map((m) => {
          const s = data.snapshots.get(m.id);
          const discuss = (s?.ballots ?? []).filter((b) => b.vote !== 'aye');
          return (
            <Card key={m.id} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <Chip tone="warn" icon="calendar">
                  {m.status === 'decided_deferred' ? 'Deferred (previous rules)' : 'Referred'}
                </Chip>
                <span className="text-caption text-ink-3">{m.motion_number}</span>
              </div>
              <Link href={`/motions/${m.id}`} className="text-body font-semibold">
                {m.title}
              </Link>
              <p className="text-small text-ink-2">{referralReasonLabel(m.referral_reason)}.</p>
              {m.referral_note && (
                <p className="bg-page text-small text-ink-2 rounded-lg px-3 py-2">
                  “{m.referral_note}” — the chair
                </p>
              )}
              {discuss.map((b) => (
                <p key={b.member_id} className="bg-page text-small text-ink-2 rounded-lg px-3 py-2">
                  <span className="font-semibold">{nameOf(data.roster, b.member_id)}</span>
                  {reasonLabel(b.reason) ? ` · ${reasonLabel(b.reason)}` : ''}
                  {b.note ? `: “${b.note}”` : ''}
                </p>
              ))}
              {s && s.electorate.length > 0 && (
                <p className="text-caption text-ink-3">
                  Votes before referral: {s.progress.ayes} Aye
                  {s.progress.others ? ` · ${s.progress.others} Discuss in person` : ''}
                  {s.progress.waiting ? ` · ${s.progress.waiting} did not vote` : ''}
                </p>
              )}
              {m.in_person_note && (
                <p className="text-caption text-ink-3">Postponed before: {m.in_person_note}</p>
              )}
              {canRecord && (
                <div className="print:hidden">
                  <OutcomeButton motionId={m.id} title={m.title} defaultDate={meetingDay} />
                </div>
              )}
            </Card>
          );
        })}

        {data.mayBeAdded.map((m) => {
          const s = data.snapshots.get(m.id)!;
          const first = s.ballots.find((b) => b.vote !== 'aye');
          return (
            <div
              key={m.id}
              className="border-faint flex flex-col gap-1.5 rounded-2xl border border-dashed px-4 py-3.5"
            >
              <span className="text-base font-semibold">May be added</span>
              <span className="text-small text-ink-2">
                <Link href={`/motions/${m.id}`} className="text-brand font-semibold">
                  {m.title}
                </Link>
                {first ? `: ${nameOf(data.roster, first.member_id)} chose Discuss in person` : ''}
                {first && reasonLabel(first.reason) ? ` (${reasonLabel(first.reason)})` : ''}.
                {m.voting_deadline
                  ? ` Voting closes ${formatDateTime(m.voting_deadline)} (${timeLeft(m.voting_deadline)}).`
                  : ''}
              </span>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="ratify" className="flex flex-col gap-3">
        <SectionHeading id="ratify">To ratify</SectionHeading>
        {data.toRatify.length === 0 ? (
          <EmptyState>Nothing is waiting for ratification.</EmptyState>
        ) : canRecord ? (
          <div className="print:hidden">
            <RatifyForm
              defaultDate={meetingDay}
              motions={data.toRatify.map((m) => ({
                id: m.id,
                title: m.title,
                detail: `${m.motion_number} · ${statusChip(m.status).label}${m.decided_at ? ` ${formatDate(m.decided_at)}` : ''}`,
              }))}
            />
          </div>
        ) : null}
        {data.toRatify.length > 0 && (
          <ul
            className={`border-line divide-line divide-y rounded-2xl border bg-white ${canRecord ? 'hidden print:block' : ''}`}
          >
            {data.toRatify.map((m) => (
              <li key={m.id}>
                <Link href={`/motions/${m.id}`} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="text-base font-semibold">{m.title}</span>
                  <span className="text-caption text-ink-3">
                    {m.motion_number}
                    {m.status === 'approved'
                      ? ` · Approved ${m.electorate_size ? `${m.electorate_size}–0 ` : ''}${m.decided_at ? `on ${formatDate(m.decided_at)}` : ''}`
                      : ' · Passed under the previous rules'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AutoRefresh />
    </main>
  );
}
