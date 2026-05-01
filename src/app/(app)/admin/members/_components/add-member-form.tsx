'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { addMember, type MemberActionState } from '../actions';

const initialState: MemberActionState = { status: 'idle' };

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(addMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="full_name" className="text-xs font-medium text-neutral-700">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            placeholder="Jane Smith"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-neutral-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="jane@example.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="role" className="text-xs font-medium text-neutral-700">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="member"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            <option value="member">Member</option>
            <option value="secretary">Secretary</option>
            <option value="chair">Chair</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add member'}
        </Button>
        {state.status === 'success' && (
          <p className="text-sm text-emerald-700">Member added — they can now log in with their email.</p>
        )}
        {state.status === 'error' && (
          <p className="text-destructive text-sm" role="alert">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
