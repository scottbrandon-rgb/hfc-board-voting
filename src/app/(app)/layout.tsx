import { requireMember } from '@/lib/dal';
import { AppHeader } from './_components/app-header';
import { ProvisionalFooter } from './_components/provisional-footer';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--background)' }}>
      <AppHeader member={member} />
      <div className="flex-1">{children}</div>
      <ProvisionalFooter />
    </div>
  );
}
