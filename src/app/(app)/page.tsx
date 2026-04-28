import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { isWithinDays } from '@/lib/motions';
import { buttonVariants } from '@/components/ui/button';
import { DashboardSection, EmptyState } from './_components/dashboard-section';
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
      // Drafts are visible only to creator + chair (RLS); show in Active
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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back, {member.full_name.split(' ')[0]}.
          </p>
        </div>
        {isChair && (
          <Link href="/motions/new" className={buttonVariants({ className: 'h-11 px-4' })}>
            New motion
          </Link>
        )}
      </div>

      <DashboardSection title="Active" subtitle="Needs your action">
        {active.length > 0 ? (
          <div className="space-y-3">
            {active.map((m) => (
              <MotionCard key={m.id} motion={m} />
            ))}
          </div>
        ) : (
          <EmptyState>
            {isChair
              ? 'No drafts. Tap “New motion” to create one.'
              : 'No motions need your action right now.'}
          </EmptyState>
        )}
      </DashboardSection>

      <DashboardSection title="In Progress" subtitle="Awaiting other members">
        {inProgress.length > 0 ? (
          <div className="space-y-3">
            {inProgress.map((m) => (
              <MotionCard key={m.id} motion={m} />
            ))}
          </div>
        ) : (
          <EmptyState>No motions in flight.</EmptyState>
        )}
      </DashboardSection>

      <DashboardSection title="Recent" subtitle="Decided in the last 30 days">
        {recent.length > 0 ? (
          <div className="space-y-3">
            {recent.map((m) => (
              <MotionCard key={m.id} motion={m} />
            ))}
          </div>
        ) : (
          <EmptyState>No recent motions.</EmptyState>
        )}
      </DashboardSection>
    </main>
  );
}
