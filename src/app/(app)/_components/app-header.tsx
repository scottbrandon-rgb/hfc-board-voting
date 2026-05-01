import Link from 'next/link';
import Image from 'next/image';
import type { CurrentMember } from '@/lib/dal';
import { DashboardLink } from './dashboard-link';

export function AppHeader({ member }: { member: CurrentMember }) {
  const initial = member.full_name.trim().charAt(0).toUpperCase() || '?';
  const isChair = member.role === 'chair';

  return (
    <header
      className="sticky top-0 z-10 backdrop-blur-sm"
      style={{
        height: 56,
        background: 'oklch(1 0 0 / 0.95)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-3xl items-center gap-4 px-4">
        {/* Logo + wordmark */}
        <Link
          href="/"
          aria-label="Harrison Faith Board Voting — dashboard"
          className="flex shrink-0 items-center gap-2.5"
        >
          <Image
            src="/hfc-logo.jpg"
            alt="Harrison Faith Church"
            width={32}
            height={32}
            priority
            className="rounded-full"
          />
          <span
            className="hidden text-sm font-semibold sm:block"
            style={{ color: 'var(--foreground)', letterSpacing: '-0.02em' }}
          >
            Harrison Faith
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex flex-1 items-center gap-1">
          <DashboardLink />
          <Link
            href="/motions/history"
            className="flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors"
            style={{ color: 'var(--foreground-muted)' }}
          >
            History
          </Link>
          {isChair && (
            <Link
              href="/admin/members"
              className="flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Members
            </Link>
          )}
        </nav>

        {/* Right: New motion (chair) + avatar */}
        <div className="flex shrink-0 items-center gap-2">
          {isChair && (
            <Link
              href="/motions/new"
              className="hidden h-8 items-center rounded-lg px-3 text-xs font-semibold sm:flex"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              + New motion
            </Link>
          )}
          <Link
            href="/profile"
            aria-label={`${member.full_name} — profile`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors"
            style={{
              background: 'var(--foreground)',
              color: 'var(--card)',
            }}
          >
            {initial}
          </Link>
        </div>
      </div>
    </header>
  );
}
