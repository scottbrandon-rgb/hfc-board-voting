'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { moveMotion, secondMotion, withdrawMotion, type ActionState } from '../actions';

interface Props {
  motionId: string;
  status: string;
  isChair: boolean;
  currentMemberId: string;
  movedById: string | null;
  moverName: string | null;
}

const initialState: ActionState = { status: 'idle' };

export function MotionActions({
  motionId,
  status,
  isChair,
  currentMemberId,
  movedById,
  moverName,
}: Props) {
  const [moveState, moveAction, movePending] = useActionState(
    moveMotion.bind(null, motionId),
    initialState,
  );
  const [secondState, secondAction, secondPending] = useActionState(
    secondMotion.bind(null, motionId),
    initialState,
  );
  const [withdrawState, withdrawAction, withdrawPending] = useActionState(
    withdrawMotion.bind(null, motionId),
    initialState,
  );

  const anyPending = movePending || secondPending || withdrawPending;

  const errorMsg =
    (moveState.status === 'error' && moveState.message) ||
    (secondState.status === 'error' && secondState.message) ||
    (withdrawState.status === 'error' && withdrawState.message) ||
    null;

  // ── Chair: never moves or seconds — just shows status context ───────────
  if (isChair) {
    if (status === 'open') {
      return (
        <p className="text-muted-foreground text-sm">
          Awaiting a board member to make a motion.
        </p>
      );
    }
    if (status === 'moved') {
      return (
        <p className="text-muted-foreground text-sm">
          Moved by {moverName ?? 'a member'}. Awaiting a second from another board member.
        </p>
      );
    }
    return null;
  }

  // ── Voting members ────────────────────────────────────────────────────────
  if (status === 'open') {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Any board member may formally move this motion.
        </p>
        <form action={moveAction}>
          <Button type="submit" disabled={anyPending} className="h-11 w-full">
            {movePending ? 'Moving…' : 'Move this motion'}
          </Button>
        </form>
        {errorMsg && (
          <p className="text-destructive text-sm" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  if (status === 'moved') {
    const isMover = currentMemberId === movedById;

    return (
      <div className="space-y-3">
        {isMover ? (
          <>
            <p className="text-muted-foreground text-sm">
              You moved this motion. You may withdraw it while awaiting a second.
            </p>
            <form action={withdrawAction}>
              <Button
                type="submit"
                variant="destructive"
                disabled={anyPending}
                className="h-11 w-full"
              >
                {withdrawPending ? 'Withdrawing…' : 'Withdraw motion'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Moved by {moverName ?? 'a member'}. Second it to proceed to the chair opening a
              vote.
            </p>
            <form action={secondAction}>
              <Button type="submit" disabled={anyPending} className="h-11 w-full">
                {secondPending ? 'Seconding…' : 'Second this motion'}
              </Button>
            </form>
          </>
        )}
        {errorMsg && (
          <p className="text-destructive text-sm" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  return null;
}
