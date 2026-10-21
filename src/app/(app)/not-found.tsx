import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 pt-16 text-center">
      <h1 className="text-heading font-bold">Not found</h1>
      <p className="text-body text-ink-2">
        That motion or page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className={buttonVariants({ size: 'lg' })}>
        Go to Home
      </Link>
    </main>
  );
}
