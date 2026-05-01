'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { updateDisplayName, type ProfileState } from './actions';

const initialState: ProfileState = { status: 'idle' };

export function EditNameForm({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateDisplayName, initialState);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.status === 'success') setEditing(false);
  }, [state.status]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Name</p>
          <p className="text-sm">{currentName}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">Name</p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          name="full_name"
          type="text"
          defaultValue={currentName}
          required
          maxLength={80}
          disabled={pending}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {state.status === 'error' && (
        <p className="text-destructive text-xs" role="alert">{state.message}</p>
      )}
    </form>
  );
}
