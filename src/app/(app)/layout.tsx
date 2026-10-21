import { requireMember } from '@/lib/dal';
import { BottomNav, TopNav } from '@/components/board/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  const isChair = member.role === 'chair';

  return (
    <div className="bg-page flex min-h-dvh flex-col">
      <TopNav isChair={isChair} name={member.full_name} />
      <div className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12">{children}</div>
      <BottomNav isChair={isChair} />
    </div>
  );
}
