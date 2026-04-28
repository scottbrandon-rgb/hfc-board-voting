import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open · awaiting motion',
  moved: 'Moved · awaiting second',
  seconded: 'Seconded · awaiting voting',
  voting: 'Voting open',
  decided_passed: 'Passed (provisional)',
  decided_failed: 'Failed (provisional)',
  decided_deferred: 'Deferred to in-person',
  withdrawn: 'Withdrawn',
  died_no_motion: 'Died — no motion',
  died_no_second: 'Died — no second',
  ratified: 'Ratified',
};

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  open: 'bg-blue-50 text-blue-800',
  moved: 'bg-blue-50 text-blue-800',
  seconded: 'bg-amber-50 text-amber-800',
  voting: 'bg-emerald-50 text-emerald-800',
  decided_passed: 'bg-emerald-50 text-emerald-800',
  decided_failed: 'bg-red-50 text-red-800',
  decided_deferred: 'bg-purple-50 text-purple-800',
  withdrawn: 'bg-neutral-100 text-neutral-700',
  died_no_motion: 'bg-neutral-100 text-neutral-700',
  died_no_second: 'bg-neutral-100 text-neutral-700',
  ratified: 'bg-emerald-100 text-emerald-900',
};

export type MotionCardData = {
  id: string;
  motion_number: string;
  title: string;
  status: string;
  updated_at: string;
};

export function MotionCard({ motion }: { motion: MotionCardData }) {
  const tone = STATUS_TONE[motion.status] ?? 'bg-neutral-100 text-neutral-700';
  const label = STATUS_LABELS[motion.status] ?? motion.status;
  const updatedDate = new Date(motion.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link
      href={`/motions/${motion.id}`}
      className="block rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-900/20 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium">{motion.motion_number}</p>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-neutral-900">
            {motion.title}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}
        >
          {label}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">Updated {updatedDate}</p>
    </Link>
  );
}
