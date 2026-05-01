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

// Pill badge styles using CSS vars
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:            { bg: 'var(--muted)',      color: 'var(--foreground-muted)' },
  open:             { bg: 'var(--blue-bg)',    color: 'var(--blue-fg)' },
  moved:            { bg: 'var(--blue-bg)',    color: 'var(--blue-fg)' },
  seconded:         { bg: 'var(--amber-bg)',   color: 'var(--amber-fg)' },
  voting:           { bg: 'var(--emerald-bg)', color: 'var(--emerald-fg)' },
  decided_passed:   { bg: 'var(--emerald-bg)', color: 'var(--emerald-fg)' },
  decided_failed:   { bg: 'var(--red-bg)',     color: 'var(--red-fg)' },
  decided_deferred: { bg: 'var(--purple-bg)',  color: 'var(--purple-fg)' },
  withdrawn:        { bg: 'var(--muted)',      color: 'var(--foreground-muted)' },
  died_no_motion:   { bg: 'var(--muted)',      color: 'var(--foreground-muted)' },
  died_no_second:   { bg: 'var(--muted)',      color: 'var(--foreground-muted)' },
  ratified:         { bg: 'var(--emerald-bg)', color: 'var(--emerald-fg)' },
};

// Cards with active voting get a blue accent border
const VOTING_STATUSES = new Set(['voting', 'open', 'moved', 'seconded']);

export type MotionCardData = {
  id: string;
  motion_number: string;
  title: string;
  status: string;
  updated_at: string;
};

export function MotionCard({ motion }: { motion: MotionCardData }) {
  const style = STATUS_STYLE[motion.status] ?? STATUS_STYLE.draft;
  const label = STATUS_LABELS[motion.status] ?? motion.status;
  const isActive = VOTING_STATUSES.has(motion.status);
  const updatedDate = new Date(motion.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link
      href={`/motions/${motion.id}`}
      className="group block rounded-xl bg-white p-4 shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
      style={{
        border: isActive ? '1.5px solid var(--primary)' : '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--foreground-subtle)', letterSpacing: '0.06em' }}
          >
            {motion.motion_number}
          </p>
          <h3
            className="mt-1 line-clamp-2 text-sm font-medium"
            style={{ color: 'var(--foreground)' }}
          >
            {motion.title}
          </h3>
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: style.bg, color: style.color }}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
        Updated {updatedDate}
      </p>
    </Link>
  );
}
