'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardLink() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground flex h-11 items-center px-2 text-xs font-medium transition-colors"
    >
      ← Dashboard
    </Link>
  );
}
