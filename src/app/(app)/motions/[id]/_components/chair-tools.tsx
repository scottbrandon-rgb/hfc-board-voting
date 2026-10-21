'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { extendDeadline, referMotion, type ActionState } from '../actions';

const idle: ActionState = { status: 'idle' };

/** Refer to the in-person meeting, with a required note to the board. */
export function ReferButton({
  motionId,
  motionNumber,
  title,
  voteSummary,
  meetingLabel,
  className,
}: {
  motionId: string;
  motionNumber: string;
  title: string;
  voteSummary: string | null;
  meetingLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        size="lg"
        variant="outline"
        className={className}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        Refer to meeting
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Refer to the in-person meeting"
        description={`${motionNumber} · ${title}`}
      >
        <ReferForm
          key={session}
          motionId={motionId}
          voteSummary={voteSummary}
          meetingLabel={meetingLabel}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

function ReferForm({
  motionId,
  voteSummary,
  meetingLabel,
  onDone,
}: {
  motionId: string;
  voteSummary: string | null;
  meetingLabel: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(referMotion.bind(null, motionId), idle);
  const [note, setNote] = useState('');

  if (state.status === 'success') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-title font-bold">Referred to the meeting</p>
        <p className="text-body text-ink-2">
          The board has been notified. It&apos;s on the meeting agenda with your note and the votes
          cast so far.
        </p>
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="bg-page flex flex-col gap-2 rounded-xl px-4 py-3">
        <p className="text-base font-semibold">What happens</p>
        <ul className="text-small text-ink-2 flex list-disc flex-col gap-1.5 pl-5">
          <li>Voting closes now. Votes can no longer be changed.</li>
          {voteSummary && <li>{voteSummary} stay in the record.</li>}
          <li>Every board member is notified, with your note.</li>
          <li>It&apos;s added to the agenda for {meetingLabel}.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="refer-note">
          Note to the board <span className="text-ink-3 font-medium">(required)</span>
        </Label>
        <Textarea
          id="refer-note"
          name="note"
          rows={3}
          required
          minLength={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Let's talk this through together."
        />
        <p className="text-caption text-ink-3">
          Shared with every board member and kept with the motion&apos;s record.
        </p>
      </div>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg" disabled={note.trim().length < 3} pendingText="Referring…">
        {note.trim().length < 3 ? 'Add a note to continue' : 'Refer to the meeting'}
      </SubmitButton>
      <Button type="button" variant="ghost" size="lg" onClick={onDone}>
        Keep voting open
      </Button>
    </form>
  );
}

/** Extend an open vote once, by 1–7 days, with a note to the board. */
export function ExtendButton({
  motionId,
  currentDeadline,
}: {
  motionId: string;
  currentDeadline: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <button
        type="button"
        className="text-brand min-h-11 self-start text-base font-semibold"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        Extend the deadline
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Extend the deadline"
        description={`Currently closes ${currentDeadline}`}
      >
        <ExtendForm key={session} motionId={motionId} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function ExtendForm({ motionId, onDone }: { motionId: string; onDone: () => void }) {
  const [state, action] = useActionState(extendDeadline.bind(null, motionId), idle);
  const [note, setNote] = useState('');

  if (state.status === 'success') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-title font-bold">Deadline extended</p>
        <p className="text-body text-ink-2">Voting members have been emailed the new deadline.</p>
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="extend-days">Extend by</Label>
        <select
          id="extend-days"
          name="days"
          defaultValue="2"
          className="border-line-strong text-body h-[52px] rounded-xl border bg-white px-3.5"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d} day{d === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="extend-note">
          Note to the board <span className="text-ink-3 font-medium">(required)</span>
        </Label>
        <Textarea
          id="extend-note"
          name="note"
          rows={2}
          required
          minLength={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Two members are travelling this week."
        />
      </div>
      <p className="text-caption text-ink-3">
        A deadline can be extended once. Reminders are sent again before the new deadline.
      </p>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg" disabled={note.trim().length < 3} pendingText="Extending…">
        Extend the deadline
      </SubmitButton>
    </form>
  );
}
