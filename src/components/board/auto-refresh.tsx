'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const EVENT = 'hfc:refreshed';

function busy(): boolean {
  const el = document.activeElement;
  if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  // A sheet is open: don't change the page under the member.
  return document.querySelector('[role="dialog"]') !== null;
}

/**
 * Keeps vote counts current: refreshes the page's data when it comes back
 * into view and every 30 seconds while it is visible. Skips a refresh while
 * the member is typing or has a sheet open, and pauses in the background.
 * router.refresh() re-fetches server data without reloading the page, so
 * scroll position is kept.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || busy()) return;
      router.refresh();
      window.dispatchEvent(new Event(EVENT));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs]);

  return null;
}

/** "Updated just now" / "Updated 2 min ago", next to live vote lists. */
export function UpdatedLabel() {
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const mark = () => {
      const t = Date.now();
      setAt(t);
      setNow(t);
    };
    mark();
    window.addEventListener(EVENT, mark);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.removeEventListener(EVENT, mark);
      window.clearInterval(timer);
    };
  }, []);

  if (at === null) return <span className="text-caption text-ink-3">Updates automatically</span>;
  const minutes = Math.floor((now - at) / 60_000);
  return (
    <span className="text-caption text-ink-3" aria-live="polite">
      {minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`}
    </span>
  );
}
