import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { buttonVariants } from '@/components/ui/button';
import { DashboardSection, EmptyState } from './_components/dashboard-section';

export default async function DashboardPage() {
  const member = await requireMember();
  const isChair = member.role === 'chair';

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
        <EmptyState>
          {isChair
            ? 'No motions need your attention. Tap “New motion” to create one.'
            : 'No motions need your action right now.'}
        </EmptyState>
      </DashboardSection>

      <DashboardSection title="In Progress" subtitle="Awaiting other members">
        <EmptyState>No motions in flight.</EmptyState>
      </DashboardSection>

      <DashboardSection title="Recent" subtitle="Decided in the last 30 days">
        <EmptyState>No recent motions.</EmptyState>
      </DashboardSection>
    </main>
  );
}
