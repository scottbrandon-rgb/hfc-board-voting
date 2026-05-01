'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkAllowlist, type LoginState } from './actions';
import { createClient } from '@/lib/supabase/client';

const initialState: LoginState = { status: 'idle' };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(checkAllowlist, initialState);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  // Once allowlist check passes, call signInWithOtp from the browser so the
  // PKCE code verifier is stored in the browser's own cookie context.
  useEffect(() => {
    if (state.status !== 'allowed') return;

    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    supabase.auth
      .signInWithOtp({
        email: state.email,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback`,
          shouldCreateUser: true,
        },
      })
      .then(({ error }) => {
        if (error) {
          setOtpError(`Could not send sign-in link: ${error.message}`);
        } else {
          setSentEmail(state.email);
          setSent(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We sent a sign-in link to <span className="font-medium">{sentEmail}</span>. Open it on
          this device to continue.
        </p>
        <p className="text-muted-foreground text-xs">The link expires in 1 hour.</p>
      </div>
    );
  }

  const errorMsg = otpError ?? (state.status === 'error' ? state.message : null);

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
      {errorMsg && (
        <p className="text-destructive text-sm" role="alert">
          {errorMsg}
        </p>
      )}
      <Button
        type="submit"
        className="h-11 w-full"
        disabled={pending || state.status === 'allowed'}
      >
        {pending || state.status === 'allowed' ? 'Sending link…' : 'Send sign-in link'}
      </Button>
    </form>
  );
}
