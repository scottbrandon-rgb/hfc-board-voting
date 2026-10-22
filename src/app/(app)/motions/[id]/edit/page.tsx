import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireChair } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { MotionForm } from '../../new/motion-form';

export const metadata = { title: 'Edit draft' };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  await requireChair();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: motion }, { data: attachments }] = await Promise.all([
    supabase
      .from('motions')
      .select('id, status, title, description, background, voting_period_days')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('motion_attachments')
      .select('id, file_name, file_size')
      .eq('motion_id', id)
      .order('uploaded_at'),
  ]);
  if (!motion) notFound();
  if (motion.status !== 'draft') redirect(`/motions/${id}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 md:px-8 md:pt-8">
      <header className="bg-page/95 sticky top-0 z-20 -mx-5 flex h-14 items-center px-2 backdrop-blur md:static md:mx-0 md:h-auto md:px-0">
        <Link
          href={`/motions/${id}`}
          className="text-brand text-body flex h-11 items-center gap-0.5 px-2 font-medium md:hidden"
        >
          <ChevronLeft className="size-5.5" aria-hidden="true" />
          Back
        </Link>
        <h1 className="text-body md:text-heading flex-1 pr-16 text-center font-semibold md:pr-0 md:text-left md:font-bold">
          Edit draft
        </h1>
      </header>
      <MotionForm
        initial={{
          motionId: motion.id,
          title: motion.title,
          description: motion.description,
          background: motion.background ?? '',
          votingPeriodDays: motion.voting_period_days,
          attachments: attachments ?? [],
        }}
      />
    </main>
  );
}
