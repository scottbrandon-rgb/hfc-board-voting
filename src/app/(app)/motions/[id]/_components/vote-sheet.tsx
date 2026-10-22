'use client';

import { useActionState, useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { BALLOT_REASONS, type BallotChoice } from '@/lib/rules';
import { castBallot, type BallotState } from '../actions';
import { cn } from '@/lib/utils';

export interface MyBallot {
  choice: BallotChoice | null;
  reason: string | null;
  note: string | null;
  /** A ballot cast under the previous rules (Nay, Abstain), shown until changed. */
  legacy?: string | null;
}

const idle: BallotState = { status: 'idle' };

/**
 * The member's vote: Aye or Discuss in person (with an optional reason and
 * note). Shown as a bottom sheet; the button that opens it lives in the
 * motion's action bar.
 */
export function VoteButton({
  motionId,
  motionNumber,
  title,
  deadlineLabel,
  mine,
  className,
}: {
  motionId: string;
  motionNumber: string;
  title: string;
  deadlineLabel: string;
  mine: MyBallot;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  const openSheet = () => {
    setSession((n) => n + 1);
    setOpen(true);
  };

  return (
    <>
      {mine.choice || mine.legacy ? (
        <div className={cn('flex items-center gap-3', className)}>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-caption text-ink-3">Your vote</span>
            <span
              className={cn(
                'text-body font-semibold',
                mine.choice === 'aye' ? 'text-good' : 'text-warn',
              )}
            >
              {mine.choice === 'aye'
                ? 'Aye'
                : mine.choice === 'discuss'
                  ? 'Discuss in person'
                  : `${mine.legacy} (counts as not Aye)`}
            </span>
          </div>
          <Button variant="outline" size="lg" onClick={openSheet}>
            Change vote
          </Button>
        </div>
      ) : (
        <Button size="lg" className={cn('w-full', className)} onClick={openSheet}>
          Cast your vote
        </Button>
      )}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={mine.choice || mine.legacy ? 'Change your vote' : 'Your vote'}
        description={`${motionNumber} · ${title}`}
      >
        <VoteForm
          key={session}
          motionId={motionId}
          deadlineLabel={deadlineLabel}
          mine={mine}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

function VoteForm({
  motionId,
  deadlineLabel,
  mine,
  onDone,
}: {
  motionId: string;
  deadlineLabel: string;
  mine: MyBallot;
  onDone: () => void;
}) {
  const [state, action] = useActionState(castBallot.bind(null, motionId), idle);
  const [choice, setChoice] = useState<BallotChoice | null>(mine.choice);
  const [reason, setReason] = useState<string | null>(mine.reason);

  if (state.status === 'success') {
    const approved = state.outcome === 'approved';
    const isAye = state.choice === 'aye';
    return (
      <div role="status" className="flex flex-col gap-4 pt-1">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              isAye ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn',
            )}
          >
            {isAye ? (
              <Check className="size-6" strokeWidth={3} />
            ) : (
              <MessageCircle className="size-6" />
            )}
          </span>
          <p className="text-title font-bold">
            {approved
              ? 'Approved — yours was the final Aye'
              : isAye
                ? 'Your Aye is recorded'
                : 'Recorded: Discuss in person'}
          </p>
        </div>
        <p className="text-body text-ink-2">
          {approved
            ? 'Every voting member voted Aye. The motion is approved and goes to the next meeting for ratification.'
            : isAye
              ? `${state.ayes} of ${state.electorate} Aye. You can change your vote until voting closes.`
              : `Unless you change to Aye before ${deadlineLabel}, this motion goes to the in-person meeting. The board can see your choice and reason.`}
        </p>
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Your vote</legend>
        <ChoiceCard
          value="aye"
          checked={choice === 'aye'}
          onSelect={() => setChoice('aye')}
          title="Aye"
          description="I agree with this motion."
          tone="good"
        />
        <ChoiceCard
          value="discuss"
          checked={choice === 'discuss'}
          onSelect={() => setChoice('discuss')}
          title="Discuss in person"
          description="I have a question, a concern or a conflict. Take it to the meeting."
          tone="warn"
        />
      </fieldset>

      {choice === 'discuss' && (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-semibold">Reason (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {BALLOT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className="border-line-strong has-[:checked]:border-ink has-[:checked]:bg-ink has-[:focus-visible]:ring-brand/40 flex h-11 cursor-pointer items-center rounded-full border bg-white px-4 text-base font-medium has-[:checked]:text-white has-[:focus-visible]:ring-3"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="sr-only"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="ballot-note" className="text-base font-semibold">
            Note for the board (optional)
          </label>
          <Textarea
            id="ballot-note"
            name="note"
            rows={2}
            maxLength={1000}
            defaultValue={mine.note ?? ''}
            placeholder="e.g. Is this within this year's budget?"
          />
        </div>
      )}

      <p className="bg-page text-small text-ink-2 rounded-xl px-4 py-3">
        You can change your vote until voting closes. When every voting member has voted Aye, the
        motion is approved right away.
      </p>

      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}

      <SubmitButton size="lg" disabled={!choice} pendingText="Submitting…">
        {choice === 'aye'
          ? 'Submit Aye'
          : choice === 'discuss'
            ? 'Submit: Discuss in person'
            : 'Choose Aye or Discuss in person'}
      </SubmitButton>
    </form>
  );
}

function ChoiceCard({
  value,
  checked,
  onSelect,
  title,
  description,
  tone,
}: {
  value: BallotChoice;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  tone: 'good' | 'warn';
}) {
  return (
    <label
      className={cn(
        'has-[:focus-visible]:ring-brand/40 flex min-h-[84px] cursor-pointer items-center gap-3.5 rounded-2xl border-2 bg-white px-4 py-3.5 has-[:focus-visible]:ring-3',
        checked
          ? tone === 'good'
            ? 'border-good-bar bg-[#f1f8f4]'
            : 'border-[#b4570f] bg-[#fef6ee]'
          : 'border-line',
      )}
    >
      <input
        type="radio"
        name="choice"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full',
          tone === 'good' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn',
        )}
      >
        {tone === 'good' ? (
          <Check className="size-5.5" strokeWidth={3} />
        ) : (
          <MessageCircle className="size-5.5" />
        )}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[19px] font-bold">{title}</span>
        <span className="text-small text-ink-2">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
          checked
            ? tone === 'good'
              ? 'border-good-bar'
              : 'border-[#b4570f]'
            : 'border-line-strong',
        )}
      >
        {checked && (
          <span
            className={cn('size-3 rounded-full', tone === 'good' ? 'bg-good-bar' : 'bg-[#b4570f]')}
          />
        )}
      </span>
    </label>
  );
}
