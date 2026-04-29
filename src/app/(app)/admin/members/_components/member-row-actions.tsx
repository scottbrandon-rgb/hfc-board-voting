'use client';

import { useActionState } from 'react';
import { toggleMemberActive, updateMemberRole, type MemberActionState } from '../actions';

interface Props {
  memberId: string;
  isActive: boolean;
  role: string;
  isSelf: boolean;
}

const initialState: MemberActionState = { status: 'idle' };

export function MemberRowActions({ memberId, isActive, role, isSelf }: Props) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleMemberActive.bind(null, memberId),
    initialState,
  );
  const [roleState, roleAction, rolePending] = useActionState(
    updateMemberRole.bind(null, memberId),
    initialState,
  );

  const anyPending = togglePending || rolePending;
  const errorMsg =
    (toggleState.status === 'error' && toggleState.message) ||
    (roleState.status === 'error' && roleState.message) ||
    null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
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
              <option value="chair">Chair</option>
            </select>
          </form>
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
                ? isActive
                  ? 'Deactivating…'
                  : 'Activating…'
                : isActive
                  ? 'Deactivate'
                  : 'Activate'}
            </button>
          </form>
        )}

        {isSelf && (
          <span className="text-muted-foreground text-xs">You</span>
        )}
      </div>

      {errorMsg && (
        <p className="text-destructive text-xs" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
