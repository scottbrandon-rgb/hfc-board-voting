'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ratifyMotion, archiveMotion, deleteMotion, type ActionState } from '../actions';

interface Props {
  motionId: string;
  status: string;
  isChair: boolean;
  ratifiedByName: string | null;
}

const initialState: ActionState = { status: 'idle' };

const ARCHIVABLE = [
  'decided_passed', 'decided_failed', 'decided_deferred',
  'ratified', 'withdrawn', 'died_no_motion', 'died_no_second', 'archived',
];

export function ChairActions({ motionId, status, isChair, ratifiedByName }: Props) {
  const [ratifyState, ratifyAction, ratifyPending] = useActionState(
    ratifyMotion.bind(null, motionId),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveMotion.bind(null, motionId),
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteMotion.bind(null, motionId),
    initialState,
  );

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canArchive = isChair && ARCHIVABLE.includes(status) && status !== 'archived';

  // ── Archived ───────────────────────────────────────────────────────────────
  if (status === 'archived') {
    if (!isChair) return <p className="text-muted-foreground text-sm">This motion has been archived.</p>;
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">This motion is archived and hidden from the dashboard.</p>
        <DeleteSection
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          deleteAction={deleteAction}
          deletePending={deletePending}
          deleteState={deleteState}
        />
      </div>
    );
  }

  // ── Ratified ───────────────────────────────────────────────────────────────
  if (status === 'ratified') {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          This motion has been formally ratified
          {ratifiedByName ? ` by ${ratifiedByName}` : ''} at an in-person board meeting.
        </p>
        {isChair && (
          <>
            <ArchiveSection
              canArchive={canArchive}
              confirmArchive={confirmArchive}
              setConfirmArchive={setConfirmArchive}
              archiveAction={archiveAction}
              archivePending={archivePending}
              archiveState={archiveState}
            />
            <DeleteSection
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              deleteAction={deleteAction}
              deletePending={deletePending}
              deleteState={deleteState}
            />
          </>
        )}
      </div>
    );
  }

  // ── Decided: passed ────────────────────────────────────────────────────────
  if (status === 'decided_passed') {
    return (
      <div className="space-y-3">
        {isChair ? (
          <>
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
              <p className="text-destructive text-sm" role="alert">{ratifyState.message}</p>
            )}
            <ArchiveSection
              canArchive={canArchive}
              confirmArchive={confirmArchive}
              setConfirmArchive={setConfirmArchive}
              archiveAction={archiveAction}
              archivePending={archivePending}
              archiveState={archiveState}
            />
            <DeleteSection
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              deleteAction={deleteAction}
              deletePending={deletePending}
              deleteState={deleteState}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Motion passed provisionally. Awaiting ratification by the chair at the next
            in-person board meeting.
          </p>
        )}
      </div>
    );
  }

  // ── Decided: failed / deferred ─────────────────────────────────────────────
  if (status === 'decided_failed' || status === 'decided_deferred') {
    const msg =
      status === 'decided_failed'
        ? isChair
          ? 'Motion failed provisionally. No further electronic action is required — note this in the meeting minutes.'
          : 'Motion failed. No further action required.'
        : isChair
          ? 'Motion deferred to in-person meeting. Address it at the next regular board session.'
          : 'Motion deferred. This will be addressed at the next in-person board meeting.';

    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">{msg}</p>
        {isChair && (
          <>
            <ArchiveSection
              canArchive={canArchive}
              confirmArchive={confirmArchive}
              setConfirmArchive={setConfirmArchive}
              archiveAction={archiveAction}
              archivePending={archivePending}
              archiveState={archiveState}
            />
            <DeleteSection
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              deleteAction={deleteAction}
              deletePending={deletePending}
              deleteState={deleteState}
            />
          </>
        )}
      </div>
    );
  }

  // ── Withdrawn / died — chair can archive or delete ─────────────────────────
  if (['withdrawn', 'died_no_motion', 'died_no_second'].includes(status)) {
    const msg =
      status === 'withdrawn'
        ? 'This motion was withdrawn by the mover.'
        : status === 'died_no_motion'
          ? 'This motion died — no member made a motion within the window.'
          : 'This motion died — no member provided a second within the window.';

    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">{msg}</p>
        {isChair && (
          <>
            <ArchiveSection
              canArchive={canArchive}
              confirmArchive={confirmArchive}
              setConfirmArchive={setConfirmArchive}
              archiveAction={archiveAction}
              archivePending={archivePending}
              archiveState={archiveState}
            />
            <DeleteSection
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              deleteAction={deleteAction}
              deletePending={deletePending}
              deleteState={deleteState}
            />
          </>
        )}
      </div>
    );
  }

  return null;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ArchiveSection({
  canArchive,
  confirmArchive,
  setConfirmArchive,
  archiveAction,
  archivePending,
  archiveState,
}: {
  canArchive: boolean;
  confirmArchive: boolean;
  setConfirmArchive: (v: boolean) => void;
  archiveAction: (payload: FormData) => void;
  archivePending: boolean;
  archiveState: ActionState;
}) {
  if (!canArchive) return null;
  return (
    <div className="border-t pt-3">
      {!confirmArchive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmArchive(true)}
        >
          Archive motion
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Archive this motion? It will be hidden from the dashboard but kept on record.
          </p>
          <div className="flex gap-2">
            <form action={archiveAction}>
              <Button type="submit" variant="outline" size="sm" disabled={archivePending}>
                {archivePending ? 'Archiving…' : 'Confirm archive'}
              </Button>
            </form>
            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
          </div>
          {archiveState.status === 'error' && (
            <p className="text-destructive text-sm" role="alert">{archiveState.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteSection({
  confirmDelete,
  setConfirmDelete,
  deleteAction,
  deletePending,
  deleteState,
}: {
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleteAction: (payload: FormData) => void;
  deletePending: boolean;
  deleteState: ActionState;
}) {
  return (
    <div className={confirmDelete ? '' : 'border-t pt-3'}>
      {!confirmDelete ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmDelete(true)}
        >
          Delete motion
        </Button>
      ) : (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-sm font-medium text-red-800">
            Permanently delete this motion?
          </p>
          <p className="text-xs text-red-700">
            This removes all votes, comments, attachments, and the PDF record. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <form action={deleteAction}>
              <Button
                type="submit"
                size="sm"
                disabled={deletePending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deletePending ? 'Deleting…' : 'Yes, delete permanently'}
              </Button>
            </form>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
          {deleteState.status === 'error' && (
            <p className="text-destructive text-sm" role="alert">{deleteState.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
