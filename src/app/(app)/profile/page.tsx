import { requireMember } from '@/lib/dal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditNameForm } from './edit-name-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Profile — Harrison Faith Board Voting',
};

const ROLE_LABELS: Record<string, string> = {
  chair: 'Chair',
  secretary: 'Secretary',
  member: 'Voting Member',
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

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <EditNameForm currentName={member.full_name} />
          <Field label="Email" value={member.email} />
          <Field label="Role" value={ROLE_LABELS[member.role] ?? member.role} />
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
