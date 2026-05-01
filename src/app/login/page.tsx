import Image from 'next/image';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in — Harrison Faith Board Voting',
};

export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-10"
      style={{ background: 'var(--background-subtle)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-10"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid var(--border)' }}
      >
        {/* Logo + wordmark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/hfc-logo.jpg"
            alt="Harrison Faith Church"
            width={64}
            height={64}
            priority
            className="rounded-full"
          />
          <div className="text-center">
            <h1
              className="text-lg font-semibold tracking-tight"
              style={{ color: 'var(--foreground)', letterSpacing: '-0.03em' }}
            >
              Harrison Faith
            </h1>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Deacon Board Voting
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="mb-6" style={{ borderTop: '1px solid var(--border)' }} />

        <p className="mb-5 text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Enter your board email and we&rsquo;ll send you a sign-in link.
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
