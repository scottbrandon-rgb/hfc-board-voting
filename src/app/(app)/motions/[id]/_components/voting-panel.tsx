'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { openVoting, castVote, closeVoting, type ActionState, type VoteState } from '../actions';

interface Tally {
  aye: number;
  nay: number;
  abstain: number;
  defer: number;
}

interface Props {
  motionId: string;
  status: string;
  isChair: boolean;
  currentMemberId: string;
  myVote: string | null;
  tally: Tally;
  totalVoters: number;
}

const initialState: ActionState = { status: 'idle' };
const initialVoteState: VoteState = { status: 'idle' };

const VOTE_OPTIONS = [
  {
    value: 'aye',
    label: 'Aye',
    description: 'I vote in favour',
    bg: 'var(--emerald-bg)',
    color: 'var(--emerald-fg)',
    selectedBorder: 'oklch(0.32 0.10 155)',
  },
  {
    value: 'nay',
    label: 'Nay',
    description: 'I vote against',
    bg: 'var(--red-bg)',
    color: 'var(--red-fg)',
    selectedBorder: 'oklch(0.40 0.13 25)',
  },
  {
    value: 'abstain',
    label: 'Abstain',
    description: 'I choose not to vote',
    bg: 'var(--muted)',
    color: 'var(--foreground-muted)',
    selectedBorder: 'var(--border-strong)',
  },
  {
    value: 'defer',
    label: 'Defer to in-person',
    description: 'I prefer to vote at the meeting',
    bg: 'var(--purple-bg)',
    color: 'var(--purple-fg)',
    selectedBorder: 'oklch(0.36 0.12 300)',
  },
] as const;

type VoteValue = (typeof VOTE_OPTIONS)[number]['value'];

/** 4-cell tally grid + progress bar */
function TallyGrid({ tally, totalVoters }: { tally: Tally; totalVoters: number }) {
  const voted = tally.aye + tally.nay + tally.abstain + tally.defer;
  const pct = totalVoters > 0 ? Math.round((voted / totalVoters) * 100) : 0;

  const cells = [
    { label: 'Aye',     count: tally.aye,     bg: 'var(--emerald-bg)', color: 'var(--emerald-fg)' },
    { label: 'Nay',     count: tally.nay,     bg: 'var(--red-bg)',     color: 'var(--red-fg)' },
    { label: 'Abstain', count: tally.abstain, bg: 'var(--muted)',      color: 'var(--foreground-muted)' },
    { label: 'Defer',   count: tally.defer,   bg: 'var(--purple-bg)', color: 'var(--purple-fg)' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg px-2 py-2.5 text-center"
            style={{ background: c.bg }}
          >
            <p className="text-xl font-bold" style={{ color: c.color }}>
              {c.count}
            </p>
            <p className="mt-0.5 text-xs font-medium" style={{ color: c.color }}>
              {c.label}
            </p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--muted)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: 'var(--primary)' }}
          />
        </div>
        <p className="mt-1 text-right text-xs" style={{ color: 'var(--foreground-subtle)' }}>
          {voted} of {totalVoters} member{totalVoters !== 1 ? 's' : ''} voted
        </p>
      </div>
    </div>
  );
}

export function VotingPanel({
  motionId,
  status,
  isChair,
  myVote,
  tally,
  totalVoters,
}: Props) {
  const router = useRouter();

  const [openState, openAction, openPending] = useActionState(
    openVoting.bind(null, motionId),
    initialState,
  );
  const [voteState, voteAction, votePending] = useActionState(
    castVote.bind(null, motionId),
    initialVoteState,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeVoting.bind(null, motionId),
    initialState,
  );

  useEffect(() => {
    if (voteState.status === 'success') {
      router.refresh();
    }
  }, [voteState.status, router]);

  // ── Seconded: chair opens voting ───────────────────────────────────────────
  if (status === 'seconded') {
    if (isChair) {
      return (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
            The motion has been seconded. Open voting when the board is ready.
          </p>
          <form action={openAction}>
            <Button type="submit" disabled={openPending} className="h-11 w-full">
              {openPending ? 'Opening…' : 'Open voting'}
            </Button>
          </form>
          {openState.status === 'error' && (
            <p className="text-sm text-destructive" role="alert">
              {openState.message}
            </p>
          )}
        </div>
      );
    }
    return (
      <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
        The motion has been seconded. Waiting for the chair to open voting.
      </p>
    );
  }

  // ── Voting open ────────────────────────────────────────────────────────────
  if (status === 'voting') {
    const voted = tally.aye + tally.nay + tally.abstain + tally.defer;
    const notYetVoted = totalVoters - voted;

    // Chair: tally + close form
    if (isChair) {
      return (
        <div className="space-y-4">
          <TallyGrid tally={tally} totalVoters={totalVoters} />
          {notYetVoted > 0 && (
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              {notYetVoted} member{notYetVoted !== 1 ? 's have' : ' has'} not yet voted —
              closing now will record an auto-abstain for {notYetVoted === 1 ? 'them' : 'each'}.
            </p>
          )}
          <form action={closeAction} className="space-y-3">
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Declare result
            </p>
            {(['passed', 'failed', 'deferred'] as const).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="result"
                  value={r}
                  required
                  style={{ accentColor: 'var(--primary)' }}
                />
                <span style={{ color: 'var(--foreground)' }}>
                  {r === 'passed'
                    ? 'Passed (provisional)'
                    : r === 'failed'
                      ? 'Failed (provisional)'
                      : 'Deferred to in-person'}
                </span>
              </label>
            ))}
            <Button
              type="submit"
              variant="outline"
              disabled={closePending}
              className="h-11 w-full"
            >
              {closePending ? 'Closing…' : 'Close voting and record result'}
            </Button>
          </form>
          {closeState.status === 'error' && (
            <p className="text-sm text-destructive" role="alert">
              {closeState.message}
            </p>
          )}
        </div>
      );
    }

    // Member: already voted — show confirmation + tally
    if (myVote) {
      const opt = VOTE_OPTIONS.find((o) => o.value === myVote);
      return (
        <div className="space-y-4">
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3"
            style={{ background: opt?.bg ?? 'var(--muted)', border: '1px solid var(--border)' }}
          >
            <span className="text-base">✓</span>
            <span className="text-sm font-medium" style={{ color: opt?.color ?? 'var(--foreground)' }}>
              Your vote: <strong>{opt?.label ?? myVote}</strong>
            </span>
          </div>
          <TallyGrid tally={tally} totalVoters={totalVoters} />
        </div>
      );
    }

    // Member: has not yet voted — vote choice cards
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Select your vote and submit.
        </p>
        <form action={voteAction} className="space-y-2">
          {VOTE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all has-[:checked]:border-2"
              style={
                {
                  border: '1.5px solid var(--border)',
                  '--checked-border': opt.selectedBorder,
                } as React.CSSProperties
              }
            >
              <input
                type="radio"
                name="vote"
                value={opt.value}
                required
                className="sr-only"
              />
              {/* Colour swatch */}
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: opt.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  {opt.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                  {opt.description}
                </p>
              </div>
            </label>
          ))}

          <div className="pt-1">
            <Button
              type="submit"
              disabled={votePending}
              className="h-12 w-full text-sm font-semibold"
            >
              {votePending ? 'Submitting…' : 'Submit vote'}
            </Button>
          </div>
        </form>
        {voteState.status === 'error' && (
          <p className="text-sm text-destructive" role="alert">
            {voteState.message}
          </p>
        )}
      </div>
    );
  }

  return null;
}
