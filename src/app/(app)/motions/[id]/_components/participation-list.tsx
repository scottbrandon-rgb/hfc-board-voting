/**
 * Who has cast a vote on this motion — and who has not.
 *
 * Deliberately shows participation only. The choice a member made is never
 * passed to this component; the board uses this to chase down outstanding
 * votes, not to see how anyone voted.
 */

export interface VotedEntry {
  name: string;
  /** ISO timestamp — used for ordering. */
  castAt: string;
  /** Preformatted in the board's timezone; the server holds that setting. */
  castAtLabel: string;
}

export interface PendingEntry {
  name: string;
  /** True once voting closed without a response and an auto-abstain was recorded. */
  autoAbstained: boolean;
}

export interface Participation {
  voted: VotedEntry[];
  pending: PendingEntry[];
}

export function ParticipationList({
  participation,
  closed,
}: {
  participation: Participation;
  closed: boolean;
}) {
  const { voted, pending } = participation;
  const total = voted.length + pending.length;

  if (total === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
        No voting members on the roster.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
        {voted.length} of {total} member{total !== 1 ? 's' : ''} voted
      </p>

      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {voted.map((v) => (
          <li key={v.name} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: 'oklch(0.32 0.10 155)' }}
                aria-hidden="true"
              >
                ✓
              </span>
              <span className="truncate text-sm" style={{ color: 'var(--foreground)' }}>
                {v.name}
              </span>
            </span>
            <span
              className="shrink-0 text-xs tabular-nums"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              {v.castAtLabel}
            </span>
          </li>
        ))}

        {pending.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ border: '1.5px dashed var(--border-strong)' }}
                aria-hidden="true"
              />
              <span className="truncate text-sm" style={{ color: 'var(--foreground-muted)' }}>
                {p.name}
              </span>
            </span>
            <span className="shrink-0 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
              {p.autoAbstained
                ? 'No response — auto-abstain'
                : closed
                  ? 'No vote'
                  : 'Not yet voted'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
