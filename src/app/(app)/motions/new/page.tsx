import Link from 'next/link';
import { requireChair } from '@/lib/dal';
import { buttonVariants } from '@/components/ui/button';
import { NewMotionForm } from './new-motion-form';

export const metadata = {
  title: 'New motion',
};

export default async function NewMotionPage() {
  await requireChair();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">New motion</h1>
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          ← Dashboard
        </Link>
      </div>
      <p className="text-muted-foreground text-sm">
        Save as a draft to keep working on it, or publish to open the floor for a member to move it.
      </p>
      <NewMotionForm />
    </main>
  );
}
