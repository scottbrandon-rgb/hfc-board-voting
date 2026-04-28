import { requireMember } from '@/lib/dal';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const member = await requireMember();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">HFC Board Voting</p>
          <h1 className="mt-1 text-2xl font-semibold">Welcome, {member.full_name.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1 text-sm capitalize">
            Signed in as {member.role}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <section className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Dashboard coming soon. Auth flow is live — magic link sign-in, allowlist, and session
          refresh are working.
        </p>
      </section>
    </main>
  );
}
