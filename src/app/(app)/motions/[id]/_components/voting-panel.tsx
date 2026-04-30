'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { openVoting, castVote, closeVoting, sendVoteReminders, type ActionState, type VoteState } from '../actions';

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

const VOTE_LABELS: Record<string, string> = {
  aye: 'Aye',
  nay: 'Nay',
  abstain: 'Abstain',
  defer: 'Defer to in-person',
};

function TallyRow({ tally, totalVoters }: { tally: Tally; totalVoters: number }) {
  const voted = tally.aye + tally.nay + tally.abstain + tally.defer;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="rounded-md bg-emerald-50 px-2 py-2">
          <p className="text-lg font-semibold text-emerald-800">{tally.aye}</p>
          <p className="text-xs text-emerald-700">Aye</p>
        </div>
        <div className="rounded-md bg-red-50 px-2 py-2">
          <p className="text-lg font-semibold text-red-800">{tally.nay}</p>
          <p className="text-xs text-red-700">Nay</p>
        </div>
        <div className="rounded-md bg-neutral-100 px-2 py-2">
          <p className="text-lg font-semibold text-neutral-700">{tally.abstain}</p>
          <p className="text-xs text-neutral-600">Abstain</p>
        </div>
        <div className="rounded-md bg-purple-50 px-2 py-2">
          <p className="text-lg font-semibold text-purple-800">{tally.defer}</p>
          <p className="text-xs text-purple-700">Defer</p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs text-right">
        {voted} of {totalVoters} member{totalVoters !== 1 ? 's' : ''} voted
      </p>
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
  const [reminderState, reminderAction, reminderPending] = useActionState(
    sendVoteReminders.bind(null, motionId),
    initialState,
  );

  // Auto-refresh after vote is recorded so confirmation view shows immediately
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
          <p className="text-muted-foreground text-sm">
            The motion has been seconded. Open voting when the board is ready.
          </p>
          <form action={openAction}>
            <Button type="submit" disabled={openPending} className="h-11 w-full">
              {openPending ? 'Opening…' : 'Open voting'}
            </Button>
          </form>
          {openState.status === 'error' && (
            <p className="text-destructive text-sm" role="alert">
              {openState.message}
            </p>
          )}
        </div>
      );
    }
    return (
      <p className="text-muted-foreground text-sm">
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
          <TallyRow tally={tally} totalVoters={totalVoters} />
          {notYetVoted > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                {notYetVoted} member{notYetVoted !== 1 ? 's have' : ' has'} not yet voted —
                closing now will record an auto-abstain for {notYetVoted === 1 ? 'them' : 'each'}.
              </p>
              <form action={reminderAction}>
                <button
                  type="submit"
                  disabled={reminderPending}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 disabled:opacity-50"
                >
                  {reminderPending ? 'Sending reminders…' : 'Send email reminder to non-voters'}
                </button>
              </form>
              {reminderState.status === 'error' && (
                <p className="text-destructive text-xs" role="alert">{reminderState.message}</p>
              )}
            </div>
          )}
          <form action={closeAction} className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Declare result</p>
              {(['passed', 'failed', 'deferred'] as const).map((r) => (
                <label key={r} className="flex items-center gap-2.5 text-sm">
                  <input type="radio" name="result" value={r} required className="accent-foreground" />
                  {r === 'passed'
                    ? 'Passed (provisional)'
                    : r === 'failed'
                      ? 'Failed (provisional)'
                      : 'Deferred to in-person'}
                </label>
              ))}
            </div>
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
            <p className="text-destructive text-sm" role="alert">
              {closeState.message}
            </p>
          )}
        </div>
      );
    }

    // Member: already voted — show confirmation + tally
    if (myVote) {
      return (
        <div className="space-y-4">
          <p className="text-sm">
            Your vote has been recorded:{' '}
            <span className="font-semibold">{VOTE_LABELS[myVote] ?? myVote}</span> ✓
          </p>
          <TallyRow tally={tally} totalVoters={totalVoters} />
        </div>
      );
    }

    // Member: has not yet voted — show ballot
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">Select your vote and submit.</p>
        <form action={voteAction} className="space-y-3">
          <div className="space-y-2">
            {(['aye', 'nay', 'abstain', 'defer'] as const).map((v) => (
              <label
                key={v}
                className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm cursor-pointer has-[:checked]:border-foreground has-[:checked]:bg-neutral-50"
              >
                <input type="radio" name="vote" value={v} required className="accent-foreground" />
                {VOTE_LABELS[v]}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={votePending} className="h-11 w-full">
            {votePending ? 'Submitting…' : 'Submit vote'}
          </Button>
        </form>
        {voteState.status === 'error' && (
          <p className="text-destructive text-sm" role="alert">
            {voteState.message}
          </p>
        )}
      </div>
    );
  }

  return null;
}
