'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLink, type LoginState } from './actions';

const initialState: LoginState = { status: 'idle' };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === 'sent') {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We sent a sign-in link to <span className="font-medium">{state.email}</span>. Open it on
          this device to continue.
        </p>
        <p className="text-muted-foreground text-xs">The link expires in 1 hour.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="you@harrisonfaith.org"
        />
      </div>
      {state.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? 'Sending link…' : 'Send sign-in link'}
      </Button>
    </form>
  );
}
