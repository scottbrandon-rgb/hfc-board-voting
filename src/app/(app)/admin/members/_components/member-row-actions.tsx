'use client';

import { useActionState, useState } from 'react';
import {
  toggleMemberActive,
  updateMemberRole,
  updateMemberEmail,
  deleteMember,
  type MemberActionState,
} from '../actions';

interface Props {
  memberId: string;
  isActive: boolean;
  role: string;
  email: string;
  isSelf: boolean;
}

const initialState: MemberActionState = { status: 'idle' };

export function MemberRowActions({ memberId, isActive, role, email, isSelf }: Props) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleMemberActive.bind(null, memberId),
    initialState,
  );
  const [roleState, roleAction, rolePending] = useActionState(
    updateMemberRole.bind(null, memberId),
    initialState,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    updateMemberEmail.bind(null, memberId),
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteMember.bind(null, memberId),
    initialState,
  );

  const anyPending = togglePending || rolePending || emailPending || deletePending;

  const errorMsg =
    (toggleState.status === 'error' && toggleState.message) ||
    (roleState.status === 'error' && roleState.message) ||
    (emailState.status === 'error' && emailState.message) ||
    (deleteState.status === 'error' && deleteState.message) ||
    null;

  // Close email editor on success
  if (emailState.status === 'success' && editingEmail) setEditingEmail(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Role selector */}
        {!isSelf && (
          <form action={roleAction} className="flex items-center gap-1">
            <select
              name="role"
              defaultValue={role}
              disabled={anyPending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none disabled:opacity-50"
            >
              <option value="member">Member</option>
              <option value="secretary">Secretary</option>
              <option value="chair">Chair</option>
            </select>
          </form>
        )}

        {/* Edit email toggle */}
        {!isSelf && (
          <button
            type="button"
            onClick={() => { setEditingEmail((v) => !v); setConfirmDelete(false); }}
            disabled={anyPending}
            className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:opacity-50"
          >
            {editingEmail ? 'Cancel' : 'Edit email'}
          </button>
        )}

        {/* Toggle active */}
        {!isSelf && (
          <form action={toggleAction}>
            <button
              type="submit"
              disabled={anyPending}
              className={`text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50 ${
                isActive
                  ? 'text-neutral-500 hover:text-red-600'
                  : 'text-emerald-700 hover:text-emerald-900'
              }`}
            >
              {togglePending
                ? isActive ? 'Deactivating…' : 'Activating…'
                : isActive ? 'Deactivate' : 'Activate'}
            </button>
          </form>
        )}

        {/* Delete */}
        {!isSelf && !confirmDelete && (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true); setEditingEmail(false); }}
            disabled={anyPending}
            className="text-xs font-medium text-neutral-400 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        )}

        {isSelf && (
          <span className="text-muted-foreground text-xs">You</span>
        )}
      </div>

      {/* Inline email editor */}
      {editingEmail && (
        <form action={emailAction} className="flex items-center gap-1.5 mt-1">
          <input
            name="email"
            type="email"
            defaultValue={email}
            required
            disabled={emailPending}
            className="rounded border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-50 w-48"
          />
          <button
            type="submit"
            disabled={emailPending}
            className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {emailPending ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-1 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5">
          <p className="text-xs text-red-700">Permanently delete this member?</p>
          <form action={deleteAction} className="flex items-center gap-1">
            <button
              type="submit"
              disabled={deletePending}
              className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deletePending ? 'Deleting…' : 'Yes, delete'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-red-500 underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="text-destructive text-xs" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
