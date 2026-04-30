'use client';

import { useActionState, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkEmailAllowlist, type LoginState } from './actions';

const initialState: LoginState = { status: 'idle' };

interface Props {
  /** Canonical production URL for the auth callback, e.g. https://hfc-board-voting.netlify.app/auth/callback */
  redirectTo: string;
}

export function LoginForm({ redirectTo }: Props) {
  const [allowlistState, formAction, pending] = useActionState(checkEmailAllowlist, initialState);

  // Local state for the client-side OTP send step
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  // Once the allowlist check passes, send the magic link from the browser
  // so the browser owns the PKCE code verifier from the start.
  useEffect(() => {
    if (allowlistState.status !== 'allowed') return;

    let cancelled = false;
    setSending(true);
    setOtpError(null);

    const supabase = createClient();
    supabase.auth
      .signInWithOtp({
        email: allowlistState.email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      })
      .then(({ error }) => {
        if (cancelled) return;
        setSending(false);
        if (error) {
          setOtpError(error.message);
        } else {
          setSentEmail(allowlistState.email);
          setSent(true);
        }
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowlistState.status, redirectTo]);

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

  const anyPending = pending || sending;
  const errorMsg =
    (allowlistState.status === 'error' && allowlistState.message) || otpError || null;

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
      <Button type="submit" className="h-11 w-full" disabled={anyPending}>
        {sending ? 'Sending link…' : pending ? 'Checking…' : 'Send sign-in link'}
      </Button>
    </form>
  );
}
