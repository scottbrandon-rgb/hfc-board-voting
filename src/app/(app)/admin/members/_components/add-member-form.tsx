'use client';

import { useActionState, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { addMember, type MemberActionState } from '../actions';

const idle: MemberActionState = { status: 'idle' };

export function AddMemberButton() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        size="lg"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <UserPlus className="size-5" aria-hidden="true" />
        Add member
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a board member"
        description="They sign in with a code sent to this email. No password needed."
      >
        <AddMemberForm key={session} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(addMember, idle);

  if (state.status === 'success') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-body">{state.message}</p>
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="new-name" className="text-base font-semibold">
        Full name
      </label>
      <Input
        id="new-name"
        name="full_name"
        required
        maxLength={80}
        autoComplete="off"
        placeholder="Jane Smith"
      />
      <label htmlFor="new-email" className="text-base font-semibold">
        Email
      </label>
      <Input
        id="new-email"
        name="email"
        type="email"
        required
        autoComplete="off"
        autoCapitalize="none"
        inputMode="email"
        placeholder="jane@example.com"
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Role</legend>
        <RoleOption value="member" label="Member" detail="Votes online" defaultChecked />
        <RoleOption
          value="secretary"
          label="Secretary"
          detail="Votes online and keeps the meeting record"
        />
      </fieldset>
      <p className="bg-page text-small text-ink-2 rounded-xl px-4 py-3">
        To change who is chair, open the new chair&apos;s name on the Board page and choose Chair.
      </p>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg" pendingText="Adding…">
        Add and send welcome email
      </SubmitButton>
    </form>
  );
}

export function RoleOption({
  value,
  label,
  detail,
  defaultChecked,
  name = 'role',
}: {
  value: string;
  label: string;
  detail: string;
  defaultChecked?: boolean;
  name?: string;
}) {
  return (
    <label className="border-line has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-brand/40 flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 has-[:focus-visible]:ring-3">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="accent-brand size-5"
      />
      <span className="flex flex-col">
        <span className="text-body font-semibold">{label}</span>
        <span className="text-small text-ink-2">{detail}</span>
      </span>
    </label>
  );
}
