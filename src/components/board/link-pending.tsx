'use client';

import { useLinkStatus } from 'next/link';

/**
 * Put inside a <Link>: a thin bar across the top of the screen while that
 * link's page loads, so a tap always gets feedback. (A route-wide loading.tsx
 * would do this too, but in Next 16 it can leave a server action's button
 * stuck on "Saving…" after the page refreshes.)
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="bg-brand pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 animate-pulse"
    />
  );
}
