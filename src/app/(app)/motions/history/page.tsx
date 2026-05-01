import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Motion History — Harrison Faith Board Voting',
};

const STATUS_LABELS: Record<string, string> = {
  decided_passed: 'Passed',
  decided_failed: 'Failed',
  decided_deferred: 'Deferred',
  ratified: 'Ratified',
  withdrawn: 'Withdrawn',
  died_no_motion: 'Died — no motion',
  died_no_second: 'Died — no second',
  archived: 'Archived',
};

const STATUS_TONE: Record<string, string> = {
  decided_passed: 'bg-emerald-50 text-emerald-800',
  decided_failed: 'bg-red-50 text-red-800',
  decided_deferred: 'bg-purple-50 text-purple-800',
  ratified: 'bg-emerald-100 text-emerald-900',
  withdrawn: 'bg-neutral-100 text-neutral-600',
  died_no_motion: 'bg-neutral-100 text-neutral-600',
  died_no_second: 'bg-neutral-100 text-neutral-600',
  archived: 'bg-neutral-100 text-neutral-500',
};

const TERMINAL_STATUSES = [
  'decided_passed',
  'decided_failed',
  'decided_deferred',
  'ratified',
  'withdrawn',
  'died_no_motion',
  'died_no_second',
  'archived',
];

// Group label ordering
const GROUP_ORDER = [
  'ratified',
  'decided_passed',
  'decided_failed',
  'decided_deferred',
  'withdrawn',
  'died_no_motion',
  'died_no_second',
  'archived',
];

export default async function HistoryPage() {
  await requireMember();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('motions')
    .select('id, motion_number, title, status, decided_at, created_at')
    .in('status', TERMINAL_STATUSES)
    .order('decided_at', { ascending: false, nullsFirst: false });

  const motions = rows ?? [];

  // Group by status
  const grouped: Record<string, typeof motions> = {};
  for (const m of motions) {
    if (!grouped[m.status]) grouped[m.status] = [];
    grouped[m.status].push(m);
  }

  const orderedGroups = GROUP_ORDER.filter((s) => grouped[s]?.length);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Motion History</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {motions.length} closed motion{motions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {motions.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">No closed motions yet.</p>
          </CardContent>
        </Card>
      )}

      {orderedGroups.map((status) => (
        <section key={status} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-900 uppercase">
              {STATUS_LABELS[status] ?? status}
            </h2>
            <span className="text-muted-foreground text-xs">
              {grouped[status].length}
            </span>
          </div>
          <div className="space-y-2">
            {grouped[status].map((m) => {
              const date = m.decided_at ?? m.created_at;
              const formatted = new Date(date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              return (
                <Link
                  key={m.id}
                  href={`/motions/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 transition-all hover:shadow-sm"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-xs font-medium">{m.motion_number}</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-neutral-900">{m.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[m.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                      {STATUS_LABELS[m.status] ?? m.status}
                    </span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">{formatted}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
