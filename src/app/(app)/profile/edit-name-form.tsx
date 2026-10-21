'use client';

import { useActionState, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { updateDisplayName, type ProfileState } from './actions';

const idle: ProfileState = { status: 'idle' };

/** The member's name as the board sees it, edited in a bottom sheet. */
export function EditNameForm({ currentName }: { currentName: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
        className="focus-visible:ring-brand/40 flex min-h-14 w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-3"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-caption text-ink-3">Name</span>
          <span className="text-body truncate font-semibold">{currentName}</span>
        </span>
        <span className="text-brand text-small inline-flex items-center gap-1.5 font-semibold">
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </span>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Your name"
        description="Shown to the board on votes and comments."
      >
        <NameForm key={session} currentName={currentName} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function NameForm({ currentName, onDone }: { currentName: string; onDone: () => void }) {
  const [state, action] = useActionState(updateDisplayName, idle);

  if (state.status === 'success') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-body">Your name is updated.</p>
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="full_name" className="text-base font-semibold">
        Full name
      </label>
      <Input
        id="full_name"
        name="full_name"
        defaultValue={currentName}
        required
        maxLength={80}
        autoComplete="name"
      />
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg">Save name</SubmitButton>
    </form>
  );
}
