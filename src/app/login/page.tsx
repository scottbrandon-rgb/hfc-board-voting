import { Monogram } from '@/components/board/ui';
import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

const NOTICES: Record<string, string> = {
  inactive:
    'Your board membership is no longer active, so you have been signed out. If this is a mistake, ask the chair.',
  missing_code: 'That sign-in link was incomplete. Enter your email to get a code instead.',
  link_expired: 'That sign-in link has expired. Enter your email to get a code instead.',
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const noticeKey = one(params.notice) ?? one(params.error);
  const notice = noticeKey ? (NOTICES[noticeKey] ?? null) : null;

  return (
    <main className="bg-page flex min-h-dvh flex-col items-center px-5 pt-[max(3rem,env(safe-area-inset-top))] pb-10 sm:justify-center sm:pt-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Monogram size={64} />
          <div className="flex flex-col gap-1">
            <h1 className="text-heading font-bold tracking-tight">Deacon Board</h1>
            <p className="text-body text-ink-3">Harrison Faith Church</p>
          </div>
        </div>
        <LoginForm next={safeNext(one(params.next))} notice={notice} />
      </div>
    </main>
  );
}
