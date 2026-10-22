'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/board/ui';
import { moveMotion, secondMotion, withdrawMotion, type ActionState } from '../actions';
import { cn } from '@/lib/utils';

type Kind = 'move' | 'second' | 'withdraw';

const LABELS: Record<Kind, { idle: string; pending: string }> = {
  move: { idle: 'Move this motion', pending: 'Moving…' },
  second: { idle: 'Second this motion', pending: 'Seconding…' },
  withdraw: { idle: 'Withdraw my motion', pending: 'Withdrawing…' },
};

const ACTIONS: Record<Kind, (id: string) => Promise<ActionState>> = {
  move: moveMotion,
  second: secondMotion,
  withdraw: withdrawMotion,
};

/** Move, second or withdraw — one clear button for whatever the member can do. */
export function ProcedureButton({
  motionId,
  kind,
  className,
}: {
  motionId: string;
  kind: Kind;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        size="lg"
        variant={kind === 'withdraw' ? 'outline' : 'default'}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await ACTIONS[kind](motionId);
            if (result.status === 'error') setError(result.message);
          })
        }
      >
        {pending ? LABELS[kind].pending : LABELS[kind].idle}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
