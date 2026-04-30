'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { publishDraft, deleteDraft, type ActionState } from '../actions';

interface Props {
  motionId: string;
  isChair: boolean;
}

const idle: ActionState = { status: 'idle' };

export function DraftActions({ motionId, isChair }: Props) {
  const [publishState, publishAction, publishPending] = useActionState(
    publishDraft.bind(null, motionId),
    idle,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDraft.bind(null, motionId),
    idle,
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const anyPending = publishPending || deletePending;

  if (!isChair) {
    return (
      <p className="text-muted-foreground text-sm">
        This motion is a draft and has not been published yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        This motion is saved as a draft. Publish it to make it visible to all board members and open
        it for motions.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Publish */}
        <form action={publishAction}>
          <Button type="submit" disabled={anyPending}>
            {publishPending ? 'Publishing…' : 'Publish motion'}
          </Button>
        </form>

        {/* Delete — two-step confirm */}
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={anyPending}
            className="text-muted-foreground hover:text-destructive text-sm underline-offset-2 hover:underline disabled:opacity-50"
          >
            Delete draft
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Are you sure?</span>
            <form action={deleteAction}>
              <button
                type="submit"
                disabled={anyPending}
                className="text-destructive text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50"
              >
                {deletePending ? 'Deleting…' : 'Yes, delete'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={anyPending}
              className="text-muted-foreground text-sm underline-offset-2 hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {publishState.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {publishState.message}
        </p>
      )}
      {deleteState.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {deleteState.message}
        </p>
      )}
    </div>
  );
}
