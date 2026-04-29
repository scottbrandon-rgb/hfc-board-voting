import { requireChair } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddMemberForm } from './_components/add-member-form';
import { MemberRowActions } from './_components/member-row-actions';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  chair: 'Chair',
  member: 'Member',
};

export default async function AdminMembersPage() {
  const currentMember = await requireChair();
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('members')
    .select('id, full_name, email, role, is_active, created_at')
    .order('role', { ascending: true }) // chair first
    .order('full_name', { ascending: true });

  const active = (members ?? []).filter((m) => m.is_active);
  const inactive = (members ?? []).filter((m) => !m.is_active);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Board Members</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {active.length} active · {inactive.length} inactive
        </p>
      </div>

      {/* ── Add member ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add member</CardTitle>
        </CardHeader>
        <CardContent>
          <AddMemberForm />
        </CardContent>
      </Card>

      {/* ── Active members ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active</CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active members.</p>
          ) : (
            <ul className="divide-y">
              {active.map((m) => {
                const initial = m.full_name.trim().charAt(0).toUpperCase() || '?';
                const isSelf = m.id === currentMember.id;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.full_name}
                          {isSelf && (
                            <span className="text-muted-foreground ml-1.5 text-xs font-normal">(you)</span>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                      <MemberRowActions
                        memberId={m.id}
                        isActive={m.is_active}
                        role={m.role}
                        isSelf={isSelf}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Inactive members ───────────────────────────────────────────── */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-neutral-500">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {inactive.map((m) => {
                const initial = m.full_name.trim().charAt(0).toUpperCase() || '?';
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 opacity-60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-sm font-semibold text-neutral-600">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.full_name}</p>
                        <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                      <MemberRowActions
                        memberId={m.id}
                        isActive={m.is_active}
                        role={m.role}
                        isSelf={false}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
