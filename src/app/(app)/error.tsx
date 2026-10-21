'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 pt-16 text-center">
      <h1 className="text-heading font-bold">Something went wrong</h1>
      <p className="text-body text-ink-2">
        The page didn&apos;t load. Check your connection and try again. Nothing you submitted was
        lost.
      </p>
      <div className="flex w-full flex-col gap-3">
        <Button size="lg" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Go to Home
        </Link>
      </div>
    </main>
  );
}
