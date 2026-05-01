import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { isWithinDays } from '@/lib/motions';
import { buttonVariants } from '@/components/ui/button';
import { DashboardSection, EmptyState } from './_components/dashboard-section';
// buttonVariants used for mobile "New motion" button
import { MotionCard, type MotionCardData } from './_components/motion-card';

const IN_PROGRESS_STATUSES = ['open', 'moved', 'seconded', 'voting'] as const;
const DECIDED_STATUSES = [
  'decided_passed',
  'decided_failed',
  'decided_deferred',
  'ratified',
  'withdrawn',
  'died_no_motion',
  'died_no_second',
] as const;

function lastUpdate(m: {
  decided_at: string | null;
  voting_opened_at: string | null;
  seconded_at: string | null;
  moved_at: string | null;
  published_at: string | null;
  created_at: string;
}): string {
  return (
    m.decided_at ??
    m.voting_opened_at ??
    m.seconded_at ??
    m.moved_at ??
    m.published_at ??
    m.created_at
  );
}

export default async function DashboardPage() {
  const member = await requireMember();
  const isChair = member.role === 'chair';
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('motions')
    .select(
      'id, motion_number, title, status, created_at, published_at, moved_at, seconded_at, voting_opened_at, decided_at',
    )
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false });

  const motions = rows ?? [];

  const active: MotionCardData[] = [];
  const inProgress: MotionCardData[] = [];
  const recent: MotionCardData[] = [];

  for (const m of motions) {
    const card: MotionCardData = {
      id: m.id,
      motion_number: m.motion_number,
      title: m.title,
      status: m.status,
      updated_at: lastUpdate(m),
    };

    if (m.status === 'draft') {
      active.push(card);
    } else if ((IN_PROGRESS_STATUSES as readonly string[]).includes(m.status)) {
      inProgress.push(card);
    } else if (
      (DECIDED_STATUSES as readonly string[]).includes(m.status) &&
      isWithinDays(m.decided_at, 30)
    ) {
      recent.push(card);
    }
  }

  // Items that genuinely need this member's attention
  const needsAction =
    inProgress.filter((m) =>
      (m.status === 'open' && member.role !== 'chair' && member.role !== 'secretary') ||
      m.status === 'voting',
    ).length + (isChair ? active.length : 0);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--foreground)', letterSpacing: '-0.03em' }}
          >
            Dashboard
          </h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
            Welcome back, {member.full_name.split(' ')[0]}.
            {needsAction > 0 && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: 'var(--amber-bg)', color: 'var(--amber-fg)' }}
              >
                {needsAction} need{needsAction === 1 ? 's' : ''} action
              </span>
            )}
          </p>
        </div>
        {isChair && (
          <div className="flex items-center gap-2 sm:hidden">
            <Link href="/motions/new" className={buttonVariants({ className: 'h-9 px-4' })}>
              New motion
            </Link>
          </div>
        )}
      </div>

      {/* ── Drafts (chair only, when drafts exist) ──────────────────────── */}
      {isChair && active.length > 0 && (
        <DashboardSection title="Drafts" subtitle="Not yet published">
          <div className="space-y-3">
            {active.map((m) => (
              <MotionCard key={m.id} motion={m} />
            ))}
          </div>
        </DashboardSection>
      )}

      {/* ── In Progress ─────────────────────────────────────────────────── */}
      <DashboardSection
        title="In Progress"
        subtitle={
          inProgress.length > 0
            ? `${inProgress.length} motion${inProgress.length !== 1 ? 's' : ''} in flight`
            : 'All clear'
        }
      >
        {inProgress.length > 0 ? (
          <div className="space-y-3">
            {inProgress.map((m) => (
              <MotionCard key={m.id} motion={m} />
            ))}
          </div>
        ) : (
          <EmptyState>No motions in progress.</EmptyState>
        )}
      </DashboardSection>

      {/* ── Recently Decided ────────────────────────────────────────────── */}
      <DashboardSection title="Recently Decided" subtitle="Last 30 days">
        {recent.length > 0 ? (
          <>
            <div className="space-y-3">
              {recent.map((m) => (
                <MotionCard key={m.id} motion={m} />
              ))}
            </div>
            <Link
              href="/motions/history"
              className="mt-1 block text-center text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
            >
              View full history →
            </Link>
          </>
        ) : (
          <EmptyState>
            No motions decided in the last 30 days.{' '}
            <Link href="/motions/history" className="underline underline-offset-2">
              View full history
            </Link>
          </EmptyState>
        )}
      </DashboardSection>
    </main>
  );
}
