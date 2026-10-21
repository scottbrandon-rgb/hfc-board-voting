'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { sendCall } from '@/app/(app)/motions/[id]/actions';

/**
 * The chair's nudge for one motion: a call for a motion, a call for a second,
 * or a reminder to members who have not voted (the server decides which).
 */
export function CallButton({
  motionId,
  label,
  className,
  variant = 'outline',
}: {
  motionId: string;
  label: string;
  className?: string;
  variant?: 'outline' | 'secondary' | 'default';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className={className}>
      <Button
        variant={variant}
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await sendCall(motionId);
            if (result.status === 'success') {
              setMessage({ ok: true, text: result.message ?? 'Sent.' });
              router.refresh();
            } else if (result.status === 'error') {
              setMessage({ ok: false, text: result.message });
            }
          })
        }
      >
        {pending ? 'Sending…' : label}
      </Button>
      {message && (
        <p role="status" className={`text-small mt-2 ${message.ok ? 'text-good' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
