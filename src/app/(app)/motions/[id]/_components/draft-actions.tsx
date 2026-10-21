'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet } from '@/components/board/sheet';
import { ErrorText } from '@/components/board/ui';
import { deleteDraft, publishDraft } from '../actions';
import { cn } from '@/lib/utils';

/** Chair: edit, publish or delete a draft. Publishing emails the board, so it asks first. */
export function DraftActions({ motionId, className }: { motionId: string; className?: string }) {
  const [confirm, setConfirm] = useState<'publish' | 'delete' | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (kind: 'publish' | 'delete') =>
    start(async () => {
      setError(null);
      const result =
        kind === 'publish' ? await publishDraft(motionId) : await deleteDraft(motionId);
      if (result?.status === 'error') setError(result.message);
      else setConfirm(null);
    });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href={`/motions/${motionId}/edit`}
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Edit
        </Link>
        <Button size="lg" onClick={() => setConfirm('publish')}>
          Publish
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setConfirm('delete')}
        className="text-danger min-h-11 text-base font-semibold"
      >
        Delete draft
      </button>

      <Sheet
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'delete' ? 'Delete this draft?' : 'Publish to the board?'}
        description={
          confirm === 'delete'
            ? 'The draft and its documents are removed. This cannot be undone.'
            : 'Every board member is emailed and asked to move and second it. Its text can no longer be edited.'
        }
      >
        {error && <ErrorText>{error}</ErrorText>}
        <Button
          size="lg"
          variant={confirm === 'delete' ? 'destructive' : 'default'}
          disabled={pending}
          onClick={() => confirm && run(confirm)}
        >
          {pending ? 'Working…' : confirm === 'delete' ? 'Delete draft' : 'Publish'}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setConfirm(null)}>
          Cancel
        </Button>
      </Sheet>
    </div>
  );
}
