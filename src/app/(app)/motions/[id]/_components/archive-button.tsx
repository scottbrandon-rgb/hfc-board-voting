'use client';

import { useState, useTransition } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/board/ui';
import { setArchived } from '../actions';

/** Chair: hide a finished motion from the meeting lists, or bring it back. */
export function ArchiveButton({ motionId, archived }: { motionId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="ghost"
        className="self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setArchived(motionId, !archived);
            if (result.status === 'error') setError(result.message);
          })
        }
      >
        {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        {pending ? 'Saving…' : archived ? 'Unarchive' : 'Archive'}
      </Button>
      <p className="text-caption text-ink-3">
        {archived
          ? 'Archived: hidden from the meeting lists. The record is unchanged.'
          : 'Archiving hides it from the meeting lists. The record is unchanged.'}
      </p>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
