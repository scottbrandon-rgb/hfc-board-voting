import Link from 'next/link';
import Image from 'next/image';
import type { CurrentMember } from '@/lib/dal';

export function AppHeader({ member }: { member: CurrentMember }) {
  const initial = member.full_name.trim().charAt(0).toUpperCase() || '?';

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto w-full max-w-3xl px-4 py-4">
        <Link href="/" aria-label="HFC Board Voting — dashboard" className="block">
          <Image
            src="/hfc-logo.png"
            alt="Harrison Faith Church"
            width={1000}
            height={1000}
            priority
            className="mx-auto h-20 w-auto sm:h-24"
          />
          <span className="sr-only">Board Voting</span>
        </Link>
        <Link
          href="/profile"
          aria-label={`${member.full_name} — profile`}
          className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
