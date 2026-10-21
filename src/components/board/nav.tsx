'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, House, List, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Monogram } from '@/components/board/ui';
import { initials } from '@/lib/format';
import { LinkPending } from '@/components/board/link-pending';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  match: (path: string) => boolean;
}

function items(isChair: boolean): NavItem[] {
  return [
    { href: '/', label: 'Home', icon: House, match: (p) => p === '/' },
    { href: '/motions', label: 'Motions', icon: List, match: (p) => p.startsWith('/motions') },
    {
      href: '/meeting',
      label: 'Meeting',
      icon: CalendarDays,
      match: (p) => p.startsWith('/meeting'),
    },
    isChair
      ? {
          href: '/admin/members',
          label: 'Board',
          icon: Users,
          match: (p) => p.startsWith('/admin') || p.startsWith('/profile'),
        }
      : { href: '/profile', label: 'Profile', icon: User, match: (p) => p.startsWith('/profile') },
  ];
}

/** Screens with their own back button and action bar hide the tab bar. */
function isDetailScreen(path: string): boolean {
  return /^\/motions\/[^/]+/.test(path);
}

export function BottomNav({ isChair }: { isChair: boolean }) {
  const path = usePathname();
  if (isDetailScreen(path)) return null;
  return (
    <nav
      aria-label="Main"
      className="border-line fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items(isChair).map((item) => {
        const active = item.match(path);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'text-caption focus-visible:bg-brand-soft flex min-h-16 flex-col items-center justify-center gap-1 outline-none',
              active ? 'text-brand font-semibold' : 'text-ink-3 font-medium',
            )}
          >
            <Icon className="size-6" aria-hidden={true} />
            {item.label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}

export function TopNav({ isChair, name }: { isChair: boolean; name: string }) {
  const path = usePathname();
  const nav = items(isChair).slice(0, 3);
  if (isChair)
    nav.push({
      href: '/admin/members',
      label: 'Board',
      icon: Users,
      match: (p) => p.startsWith('/admin'),
    });
  return (
    <header className="border-line hidden border-b bg-white md:block">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center gap-6 px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Monogram />
          <span className="text-body font-semibold">Deacon Board</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-1">
          {nav.map((item) => {
            const active = item.match(path);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center rounded-xl px-4 text-base',
                  active
                    ? 'bg-brand-soft text-brand font-semibold'
                    : 'text-ink-2 hover:bg-page font-medium',
                )}
              >
                {item.label === 'Meeting' ? 'Next meeting' : item.label}
                <LinkPending />
              </Link>
            );
          })}
        </nav>
        <Link
          href="/profile"
          aria-label={`${name}, profile and settings`}
          className="bg-brand-soft text-brand flex size-11 items-center justify-center rounded-full text-sm font-bold"
        >
          {initials(name)}
        </Link>
      </div>
    </header>
  );
}

/** The phone header on tab screens: monogram and board name. */
export function MobileBrand() {
  return (
    <div className="flex items-center gap-2.5 md:hidden">
      <Monogram />
      <span className="text-body font-semibold">Deacon Board</span>
    </div>
  );
}
