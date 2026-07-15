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

  // Local state for the code-entry step.
  const [codeSent, setCodeSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Once the allowlist check passes, send a one-time code (not a magic link)
  // from the browser. verifyOtp exchanges the typed code for a session, so
  // email link scanners can't consume the login before the user acts.
  useEffect(() => {
    if (state.status !== 'allowed') return;

    const supabase = createClient();
    supabase.auth
      .signInWithOtp({
        email: state.email,
        options: { shouldCreateUser: true },
      })
      .then(({ error }) => {
        if (error) {
          setSendError(`Could not send sign-in code: ${error.message}`);
        } else {
          setSentEmail(state.email);
          setCodeSent(true);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    const token = code.trim();
    if (token.length < 8) {
      setVerifyError('Enter the 8-digit code from your email.');
      return;
    }
    setVerifying(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: sentEmail,
      token,
      type: 'email',
    });
    if (error) {
      setVerifying(false);
      setVerifyError(
        error.message.toLowerCase().includes('expired')
          ? 'That code has expired. Request a new one below.'
          : 'That code is incorrect. Double-check and try again.',
      );
      return;
    }
    // Session cookies are now set — full navigation lets the server pick them up.
    window.location.assign('/');
  }

  // ── Step 2: enter the emailed code ──────────────────────────────────────────
  if (codeSent) {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Enter your code</h2>
          <p className="text-muted-foreground text-sm">
            We emailed an 8-digit code to <span className="font-medium">{sentEmail}</span>. Enter it
            below to sign in.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">8-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            autoFocus
            placeholder="12345678"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-[0.4em]"
          />
        </div>
        {verifyError && (
          <p className="text-destructive text-sm" role="alert">
            {verifyError}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={verifying}>
          {verifying ? 'Signing in…' : 'Verify & sign in'}
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          The code expires in 1 hour. Didn&apos;t get it? Check spam, or{' '}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            start over
          </button>
          .
        </p>
      </form>
    );
  }

  // ── Step 1: enter email ─────────────────────────────────────────────────────
  const errorMsg = sendError ?? (state.status === 'error' ? state.message : null);

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
      <Button type="submit" className="h-11 w-full" disabled={pending || state.status === 'allowed'}>
        {pending || state.status === 'allowed' ? 'Sending code…' : 'Send sign-in code'}
      </Button>
    </form>
  );
}
