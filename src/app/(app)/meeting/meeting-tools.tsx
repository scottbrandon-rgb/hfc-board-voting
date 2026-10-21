'use client';

import { useActionState, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { ratifyMotions, recordOutcome, setNextMeeting, type MeetingState } from './actions';
import { cn } from '@/lib/utils';

const idle: MeetingState = { status: 'idle' };

function Done({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="text-title font-bold">{message}</p>
      <Button size="lg" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

export function SetMeetingButton({ when, location }: { when: string; location: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {when ? 'Change date' : 'Set the date'}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Next in-person meeting">
        <SetMeetingForm
          key={session}
          when={when}
          location={location}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

function SetMeetingForm({
  when,
  location,
  onDone,
}: {
  when: string;
  location: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(setNextMeeting, idle);
  if (state.status === 'success') return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="when">Date and time (Central)</Label>
        <Input id="when" name="when" type="datetime-local" defaultValue={when} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">
          Location <span className="text-ink-3 font-normal">(optional)</span>
        </Label>
        <Input
          id="location"
          name="location"
          maxLength={200}
          defaultValue={location}
          placeholder="e.g. Fellowship hall"
        />
      </div>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg">Save</SubmitButton>
    </form>
  );
}

export function OutcomeButton({
  motionId,
  title,
  defaultDate,
}: {
  motionId: string;
  title: string;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        Record outcome
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Record the meeting outcome"
        description={title}
      >
        <OutcomeForm
          key={session}
          motionId={motionId}
          defaultDate={defaultDate}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

const RESULTS = [
  { value: 'adopted', label: 'Adopted', hint: 'The board approved it at the meeting.' },
  { value: 'not_adopted', label: 'Not adopted', hint: 'The board did not approve it.' },
  { value: 'postponed', label: 'Postponed', hint: 'Keep it on the agenda for a later meeting.' },
];

function OutcomeForm({
  motionId,
  defaultDate,
  onDone,
}: {
  motionId: string;
  defaultDate: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(recordOutcome.bind(null, motionId), idle);
  const [result, setResult] = useState<string | null>(null);
  if (state.status === 'success') return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Outcome</legend>
        {RESULTS.map((r) => (
          <label
            key={r.value}
            className={cn(
              'has-[:focus-visible]:ring-brand/40 flex min-h-16 cursor-pointer flex-col justify-center rounded-2xl border-2 bg-white px-4 py-2.5 has-[:focus-visible]:ring-3',
              result === r.value ? 'border-brand bg-brand-soft' : 'border-line',
            )}
          >
            <input
              type="radio"
              name="result"
              value={r.value}
              checked={result === r.value}
              onChange={() => setResult(r.value)}
              className="sr-only"
            />
            <span className="text-base font-semibold">{r.label}</span>
            <span className="text-small text-ink-2">{r.hint}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meeting_date">Meeting date</Label>
        <Input
          id="meeting_date"
          name="meeting_date"
          type="date"
          required
          defaultValue={defaultDate}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">
          Note for the record <span className="text-ink-3 font-normal">(optional)</span>
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={1000}
          placeholder="e.g. Adopted 6–0 after discussion."
        />
      </div>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg" disabled={!result}>
        Save outcome
      </SubmitButton>
    </form>
  );
}

export function RatifyForm({
  motions,
  defaultDate,
}: {
  motions: { id: string; title: string; detail: string }[];
  defaultDate: string;
}) {
  const [state, action] = useActionState(ratifyMotions, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
        {motions.map((m) => (
          <li key={m.id}>
            <label className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                name="motion"
                value={m.id}
                defaultChecked
                className="accent-brand size-5 shrink-0"
              />
              <span className="flex flex-col">
                <span className="text-base font-semibold">{m.title}</span>
                <span className="text-caption text-ink-3">{m.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ratify_date">Ratified at the meeting of</Label>
        <Input
          id="ratify_date"
          name="meeting_date"
          type="date"
          required
          defaultValue={defaultDate}
        />
      </div>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      {state.status === 'success' && (
        <p role="status" className="text-small text-good font-semibold">
          {state.message}
        </p>
      )}
      <SubmitButton size="lg" pendingText="Ratifying…">
        Ratify selected
      </SubmitButton>
    </form>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      Print agenda
    </Button>
  );
}
