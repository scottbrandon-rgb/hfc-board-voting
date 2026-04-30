'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { ratifyMotion, type ActionState } from '../actions';

interface Props {
  motionId: string;
  status: string;
  isChair: boolean;
  ratifiedByName: string | null;
}

const initialState: ActionState = { status: 'idle' };

export function ChairActions({ motionId, status, isChair, ratifiedByName }: Props) {
  const [ratifyState, ratifyAction, ratifyPending] = useActionState(
    ratifyMotion.bind(null, motionId),
    initialState,
  );

  // ── Ratified — show confirmation for everyone ──────────────────────────────
  if (status === 'ratified') {
    return (
      <p className="text-muted-foreground text-sm">
        This motion has been formally ratified
        {ratifiedByName ? ` by ${ratifiedByName}` : ''} at an in-person board meeting.
      </p>
    );
  }

  // ── Decided states ─────────────────────────────────────────────────────────
  if (status === 'decided_passed') {
    if (isChair) {
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Motion passed provisionally. Ratify it at the next in-person board meeting to make
            it official.
          </p>
          <form action={ratifyAction}>
            <Button type="submit" disabled={ratifyPending} className="h-11 w-full">
              {ratifyPending ? 'Ratifying…' : 'Ratify at in-person meeting'}
            </Button>
          </form>
          {ratifyState.status === 'error' && (
            <p className="text-destructive text-sm" role="alert">
              {ratifyState.message}
            </p>
          )}
        </div>
      );
    }
    return (
      <p className="text-muted-foreground text-sm">
        Motion passed provisionally. Awaiting ratification by the chair at the next in-person
        board meeting.
      </p>
    );
  }

  if (status === 'decided_failed') {
    return (
      <p className="text-muted-foreground text-sm">
        {isChair
          ? 'Motion failed provisionally. No further electronic action is required — note this in the meeting minutes.'
          : 'Motion failed. No further action required.'}
      </p>
    );
  }

  if (status === 'decided_deferred') {
    return (
      <p className="text-muted-foreground text-sm">
        {isChair
          ? 'Motion deferred to in-person meeting. Address it at the next regular board session.'
          : 'Motion deferred. This will be addressed at the next in-person board meeting.'}
      </p>
    );
  }

  return null;
}
