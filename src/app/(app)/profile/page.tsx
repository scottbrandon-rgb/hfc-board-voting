import Link from 'next/link';
import { requireMember } from '@/lib/dal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Profile — HFC Board Voting',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export default async function ProfilePage() {
  const member = await requireMember();
  const roleLabel = member.role === 'chair' ? 'Chair' : 'Voting Member';

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          ← Dashboard
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Name" value={member.full_name} />
          <Field label="Email" value={member.email} />
          <Field label="Role" value={roleLabel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Notification preferences will appear here in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign out</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
