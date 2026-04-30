import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in — HFC Board Voting',
};

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  // Thread the ?next= param through the magic link so after sign-in the
  // user lands on the page they were trying to reach (e.g. a motion).
  const redirectTo = next
    ? `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`
    : `${appUrl}/auth/callback`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-xl">HFC Board Voting</CardTitle>
          <CardDescription>
            Enter your board email and we&rsquo;ll send you a sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
    </main>
  );
}
