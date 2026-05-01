'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardLink() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <Link
      href="/"
      className="flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors"
      style={{ color: 'var(--foreground-muted)' }}
    >
      Dashboard
    </Link>
  );
}
