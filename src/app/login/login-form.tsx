'use client';

import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorText } from '@/components/board/ui';
import { createClient } from '@/lib/supabase/client';
import { checkAllowlist } from './actions';

// The email waiting for a code survives the phone reloading this page while
// the member switches to their mail app to read the code.
const PENDING_KEY = 'hfc-login-pending';
const CODE_LIFETIME_MS = 60 * 60 * 1000;
const RESEND_AFTER_S = 60;

interface Pending {
  email: string;
  sentAt: number;
}

function readPending(): Pending | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    return typeof p.email === 'string' && Date.now() - p.sentAt < CODE_LIFETIME_MS ? p : null;
  } catch {
    return null;
  }
}

function writePending(p: Pending | null) {
  try {
    if (p) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private browsing: the member just enters their email again if the page reloads.
  }
}

function sendErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate') || m.includes('seconds') || m.includes('security purposes')) {
    return 'A code was sent a moment ago. Wait a minute, then try again.';
  }
  return "We couldn't send a code just now. Please try again in a minute.";
}

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage exists only in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(readPending());
  }, []);

  async function sendCode(email: string): Promise<boolean> {
    const { error: sendError } = await createClient().auth.signInWithOtp({
      email,
      // Accounts are created by the board list, never by the sign-in form.
      options: { shouldCreateUser: false },
    });
    if (sendError) {
      setError(sendErrorMessage(sendError.message));
      return false;
    }
    const p = { email, sentAt: Date.now() };
    writePending(p);
    setPending(p);
    return true;
  }

  async function onEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await checkAllowlist({ status: 'idle' }, new FormData(e.currentTarget));
    if (result.status === 'allowed') await sendCode(result.email);
    else if (result.status === 'error') setError(result.message);
    setBusy(false);
  }

  if (pending) {
    return (
      <CodeStep
        pending={pending}
        next={next}
        onResend={() => sendCode(pending.email)}
        onDifferentEmail={() => {
          writePending(null);
          setPending(null);
          setError(null);
        }}
        resendError={error}
      />
    );
  }

  return (
    <form onSubmit={onEmailSubmit} className="flex flex-col gap-4">
      {notice && (
        <p
          role="status"
          className="bg-warn-soft text-warn text-small rounded-xl px-4 py-3 font-medium"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-base font-semibold">
          Your board email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="you@example.com"
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? 'Sending code…' : 'Email me a sign-in code'}
      </Button>
      <p className="text-small text-ink-3 text-center">
        No password needed. We&apos;ll email you an 8-digit code.
      </p>
    </form>
  );
}

function CodeStep({
  pending,
  next,
  onResend,
  onDifferentEmail,
  resendError,
}: {
  pending: Pending;
  next: string;
  onResend: () => Promise<boolean>;
  onDifferentEmail: () => void;
  resendError: string | null;
}) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - pending.sentAt) / 1000));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (wait === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [wait]);

  async function verify(token: string) {
    if (verifying) return;
    if (token.length !== 8) {
      setError('Enter all 8 digits from the email.');
      return;
    }
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      email: pending.email,
      token,
      type: 'email',
    });
    if (verifyError) {
      setVerifying(false);
      setError(
        verifyError.message.toLowerCase().includes('expired')
          ? 'That code has expired, or a newer one was sent. Use the latest code, or send a new one.'
          : "That code didn't work. Check the digits and try again.",
      );
      return;
    }
    writePending(null);
    // A full page load lets the server see the new sign-in.
    window.location.assign(next);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="bg-brand-soft text-brand flex size-12 items-center justify-center rounded-full">
          <Mail className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-title font-bold">Check your email</h2>
        <p className="text-body text-ink-2">
          We sent an 8-digit code to
          <br />
          <strong className="text-ink [overflow-wrap:anywhere]">{pending.email}</strong>
        </p>
      </div>
      <label htmlFor="code" className="sr-only">
        8-digit code
      </label>
      <Input
        ref={inputRef}
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        required
        placeholder="••••••••"
        value={code}
        disabled={verifying}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
          setCode(digits);
          if (digits.length === 8) void verify(digits);
        }}
        className="h-16 text-center font-mono text-[28px] tracking-[0.3em]"
      />
      {(error ?? resendError) && <ErrorText>{error ?? resendError}</ErrorText>}
      {resent && !resendError && wait > 0 && (
        <p role="status" className="text-small text-good text-center font-medium">
          A new code is on its way. Use the newest email.
        </p>
      )}
      <Button type="submit" size="lg" disabled={verifying}>
        {verifying ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          disabled={wait > 0 || verifying}
          onClick={async () => {
            setError(null);
            setResent(await onResend());
            setNow(Date.now());
          }}
        >
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </Button>
        <Button type="button" variant="ghost" disabled={verifying} onClick={onDifferentEmail}>
          Use a different email
        </Button>
      </div>
      <p className="text-small text-ink-3 text-center">
        The code works for one hour. Not in your inbox? Check spam or junk.
      </p>
    </form>
  );
}
