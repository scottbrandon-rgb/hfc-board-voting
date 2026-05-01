import { requireChair } from '@/lib/dal';
import { NewMotionForm } from './new-motion-form';

export const metadata = {
  title: 'New motion',
};

export default async function NewMotionPage() {
  await requireChair();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">New motion</h1>
      <p className="text-muted-foreground text-sm">
        Save as a draft to keep working on it, or publish to open the floor for a member to move it.
      </p>
      <NewMotionForm />
    </main>
  );
}
