import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireChair } from '@/lib/dal';
import { MotionForm } from './motion-form';

export const metadata = { title: 'New motion' };

export default async function NewMotionPage() {
  await requireChair();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 md:px-8 md:pt-8">
      <header className="bg-page/95 sticky top-0 z-20 -mx-5 flex h-14 items-center px-2 backdrop-blur md:static md:mx-0 md:h-auto md:px-0">
        <Link
          href="/"
          className="text-brand text-body flex h-11 items-center gap-0.5 px-2 font-medium md:hidden"
        >
          <ChevronLeft className="size-5.5" aria-hidden="true" />
          Home
        </Link>
        <h1 className="text-body md:text-heading flex-1 pr-20 text-center font-semibold md:pr-0 md:text-left md:font-bold">
          New motion
        </h1>
      </header>
      <MotionForm />
    </main>
  );
}
