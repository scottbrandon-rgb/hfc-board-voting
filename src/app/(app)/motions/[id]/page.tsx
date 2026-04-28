import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open · awaiting motion',
  moved: 'Moved · awaiting second',
  seconded: 'Seconded · awaiting voting',
  voting: 'Voting open',
  decided_passed: 'Passed (provisional)',
  decided_failed: 'Failed (provisional)',
  decided_deferred: 'Deferred to in-person',
  withdrawn: 'Withdrawn',
  died_no_motion: 'Died — no motion',
  died_no_second: 'Died — no second',
  ratified: 'Ratified',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: process.env.TIMEZONE || 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function MotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember();
  const { id } = await params;
  const supabase = await createClient();

  const { data: motion } = await supabase
    .from('motions')
    .select('id, motion_number, title, description, status, created_at, published_at, created_by')
    .eq('id', id)
    .maybeSingle();

  if (!motion) notFound();

  const { data: attachments } = await supabase
    .from('motion_attachments')
    .select('id, file_name, file_size, content_type, file_hash, uploaded_at')
    .eq('motion_id', id)
    .order('uploaded_at');

  const statusLabel = STATUS_LABELS[motion.status] ?? motion.status;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide">
            {motion.motion_number}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{motion.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{statusLabel}</p>
        </div>
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{motion.description}</p>
        </CardContent>
      </Card>

      {attachments && attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.file_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(a.file_size)} · sha256 {a.file_hash.slice(0, 12)}…
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Created {formatTimestamp(motion.created_at)}</p>
          {motion.published_at && <p>Published {formatTimestamp(motion.published_at)}</p>}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Move/second/vote actions land in the next step. For now this page just shows what was
        created.
      </p>
    </main>
  );
}
