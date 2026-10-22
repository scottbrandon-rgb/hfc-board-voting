'use client';

import { useActionState, useState, useTransition } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/board/sheet';
import { SubmitButton } from '@/components/board/submit-button';
import { Avatar, Chip, ErrorText } from '@/components/board/ui';
import { ROLE_LABELS, type Role } from '@/lib/rules';
import { cn } from '@/lib/utils';
import {
  setMemberActive,
  updateMemberEmail,
  updateMemberRole,
  type MemberActionState,
} from '../actions';
import { RoleOption } from './add-member-form';

const idle: MemberActionState = { status: 'idle' };

export interface MemberRowData {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

/** One row of the board list; tapping it opens the member's settings. */
export function MemberRow({ member, isSelf }: { member: MemberRowData; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  const row = (
    <>
      <Avatar name={member.full_name} highlight={member.role === 'chair'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate font-semibold">
          {member.full_name}
          {isSelf && <span className="text-ink-3 font-normal"> (you)</span>}
        </span>
        <span className="text-small text-ink-2 truncate">{member.email}</span>
      </span>
      <Chip tone={member.role === 'chair' ? 'brand' : 'neutral'}>{ROLE_LABELS[member.role]}</Chip>
    </>
  );

  if (isSelf) {
    return <div className={cn('flex min-h-[72px] items-center gap-3 px-4 py-3')}>{row}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
        className={cn(
          'focus-visible:ring-brand/40 flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset',
          !member.is_active && 'opacity-70',
        )}
      >
        {row}
        <ChevronRight className="text-ink-3 size-5 shrink-0" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={member.full_name} description={member.email}>
        <MemberSettings key={session} member={member} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function MemberSettings({ member, onDone }: { member: MemberRowData; onDone: () => void }) {
  const [view, setView] = useState<'menu' | 'role' | 'email' | 'retire'>('menu');

  if (view === 'role')
    return <RoleForm member={member} onDone={onDone} onBack={() => setView('menu')} />;
  if (view === 'email')
    return <EmailForm member={member} onDone={onDone} onBack={() => setView('menu')} />;
  if (view === 'retire')
    return <ActiveForm member={member} onDone={onDone} onBack={() => setView('menu')} />;

  return (
    <div className="flex flex-col gap-2.5">
      {member.is_active && member.role !== 'chair' && (
        <Button
          variant="outline"
          size="lg"
          className="justify-between"
          onClick={() => setView('role')}
        >
          Change role
          <span className="text-ink-3 font-normal">{ROLE_LABELS[member.role]}</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="lg"
        className="justify-between"
        onClick={() => setView('email')}
      >
        Change email
        <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
      </Button>
      {member.role === 'chair' ? (
        <p className="bg-page text-small text-ink-2 rounded-xl px-4 py-3">
          To change the chair, open the new chair&apos;s name and choose Chair.
        </p>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className={cn('justify-between', member.is_active && 'text-danger')}
          onClick={() => setView('retire')}
        >
          {member.is_active ? 'Retire from the board' : 'Reactivate'}
          <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function Done({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="text-body">{message}</p>
      <Button size="lg" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="ghost" size="lg" onClick={onBack}>
      Back
    </Button>
  );
}

function RoleForm({
  member,
  onDone,
  onBack,
}: {
  member: MemberRowData;
  onDone: () => void;
  onBack: () => void;
}) {
  const [state, action] = useActionState(updateMemberRole.bind(null, member.id), idle);
  if (state.status === 'success') return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Role</legend>
        <RoleOption
          value="member"
          label="Member"
          detail="Votes online"
          defaultChecked={member.role === 'member'}
        />
        <RoleOption
          value="secretary"
          label="Secretary"
          detail="Votes online and keeps the meeting record"
          defaultChecked={member.role === 'secretary'}
        />
        <RoleOption
          value="chair"
          label="Chair"
          detail="Hands the chair to this member. You become a voting member."
        />
      </fieldset>
      <p className="bg-page text-small text-ink-2 rounded-xl px-4 py-3">
        Votes already open keep the members they started with.
      </p>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg">Save role</SubmitButton>
      <BackButton onBack={onBack} />
    </form>
  );
}

function EmailForm({
  member,
  onDone,
  onBack,
}: {
  member: MemberRowData;
  onDone: () => void;
  onBack: () => void;
}) {
  const [state, action] = useActionState(updateMemberEmail.bind(null, member.id), idle);
  if (state.status === 'success') return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor={`email-${member.id}`} className="text-base font-semibold">
        Email
      </label>
      <Input
        id={`email-${member.id}`}
        name="email"
        type="email"
        required
        autoCapitalize="none"
        inputMode="email"
        defaultValue={member.email}
      />
      <p className="text-small text-ink-2">
        Their sign-in codes and board emails go to this address.
      </p>
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton size="lg">Save email</SubmitButton>
      <BackButton onBack={onBack} />
    </form>
  );
}

function ActiveForm({
  member,
  onDone,
  onBack,
}: {
  member: MemberRowData;
  onDone: () => void;
  onBack: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MemberActionState>(idle);
  const retiring = member.is_active;

  if (result.status === 'success') return <Done message={result.message} onDone={onDone} />;

  return (
    <div className="flex flex-col gap-3">
      {retiring ? (
        <div className="text-body text-ink-2 flex flex-col gap-2">
          <p>
            {member.full_name} will no longer be able to sign in or vote. Their past votes and
            comments stay on the record.
          </p>
          <p>
            A vote that is open right now still counts them as a voter. It cannot be unanimous
            without them, so it will go to the in-person meeting at its deadline.
          </p>
        </div>
      ) : (
        <p className="text-body text-ink-2">
          {member.full_name} will be able to sign in again and will vote on motions that open from
          now on.
        </p>
      )}
      {result.status === 'error' && <ErrorText>{result.message}</ErrorText>}
      <Button
        size="lg"
        variant={retiring ? 'destructive' : 'default'}
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await setMemberActive(member.id, !retiring)))
        }
      >
        {pending
          ? 'Saving…'
          : retiring
            ? `Retire ${member.full_name}`
            : `Reactivate ${member.full_name}`}
      </Button>
      <BackButton onBack={onBack} />
    </div>
  );
}
