import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { requireMember } from '@/lib/dal';
import { listMotions, parseFilter, type MotionFilter } from '@/lib/queries';
import { progressSummary, referralReasonLabel, statusChip, votingChip } from '@/lib/rules';
import { formatDate, timeLeft } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, MotionLinkCard, PageTitle, StatusChip } from '@/components/board/ui';
import { AutoRefresh } from '@/components/board/auto-refresh';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Motions' };

export default async function MotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const member = await requireMember();
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const q = (params.q ?? '').slice(0, 100);
  const { motions, snapshots } = await listMotions(filter, q, member);
  const isChair = member.role === 'chair';
  const canSeeDrafts = isChair || member.role === 'secretary';

  const tabs: { id: MotionFilter; label: string }[] = [
    { id: 'open', label: 'Open' },
    { id: 'approved', label: 'Approved' },
    { id: 'referred', label: 'Referred' },
    { id: 'all', label: 'All' },
  ];
  if (canSeeDrafts) tabs.push({ id: 'drafts', label: 'Drafts' });

  const href = (f: MotionFilter) => {
    const sp = new URLSearchParams();
    if (f !== 'open') sp.set('filter', f);
    if (q) sp.set('q', q);
    const s = sp.toString();
    return s ? `/motions?${s}` : '/motions';
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 pt-4 md:px-8 md:pt-8">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Motions</PageTitle>
        {isChair && (
          <Link href="/motions/new" className={buttonVariants({ size: 'sm' })}>
            <Plus aria-hidden="true" />
            New motion
          </Link>
        )}
      </div>

      <form action="/motions" role="search" className="relative">
        {filter !== 'open' && <input type="hidden" name="filter" value={filter} />}
        <label htmlFor="q" className="sr-only">
          Search motions
        </label>
        <Search
          className="text-ink-3 pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by title or number"
          className="border-line-strong focus-visible:border-brand focus-visible:ring-brand/30 text-body h-12 w-full rounded-xl border bg-white pr-3.5 pl-11 outline-none focus-visible:ring-3"
        />
      </form>

      <nav
        aria-label="Filter motions"
        className="grid gap-1 rounded-xl bg-[#e6e8eb] p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={href(t.id)}
            aria-current={t.id === filter ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center justify-center rounded-[9px] text-[15px] font-semibold',
              t.id === filter ? 'text-ink bg-white shadow-sm' : 'text-ink-2',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {motions.length === 0 ? (
        <EmptyState>
          {q
            ? `No motions match “${q}”.`
            : filter === 'open'
              ? 'No motions are open right now.'
              : 'Nothing here yet.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {motions.map((m) => {
            const s = snapshots.get(m.id);
            let chip = statusChip(m.status);
            let detail: string;
            if (m.status === 'voting' && s) {
              chip = votingChip(s.progress, s.viewerNeedsToVote);
              detail = `${progressSummary(s.progress)}${m.voting_deadline ? ` · ${timeLeft(m.voting_deadline)}` : ''}`;
            } else if (m.status === 'referred') {
              detail = referralReasonLabel(m.referral_reason);
            } else if (m.decided_at) {
              detail = `Decided ${formatDate(m.decided_at)}`;
            } else if (m.published_at) {
              detail = `Published ${formatDate(m.published_at)}`;
            } else {
              detail = `Created ${formatDate(m.created_at)}`;
            }
            return (
              <MotionLinkCard
                key={m.id}
                href={`/motions/${m.id}`}
                chip={<StatusChip info={chip} />}
                number={m.motion_number}
                title={m.title}
                detail={detail}
              />
            );
          })}
        </div>
      )}
      {filter === 'open' && <AutoRefresh />}
    </main>
  );
}
