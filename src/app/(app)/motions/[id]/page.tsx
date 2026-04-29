import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MotionActions } from './_components/motion-actions';
import { CommentForm } from './_components/comment-form';

export const dynamic = 'force-dynamic';

// ─── Status display ───────────────────────────────────────────────────────────

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

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  open: 'bg-blue-50 text-blue-800',
  moved: 'bg-blue-50 text-blue-800',
  seconded: 'bg-amber-50 text-amber-800',
  voting: 'bg-emerald-50 text-emerald-800',
  decided_passed: 'bg-emerald-50 text-emerald-800',
  decided_failed: 'bg-red-50 text-red-800',
  decided_deferred: 'bg-purple-50 text-purple-800',
  withdrawn: 'bg-neutral-100 text-neutral-700',
  died_no_motion: 'bg-neutral-100 text-neutral-700',
  died_no_second: 'bg-neutral-100 text-neutral-700',
  ratified: 'bg-emerald-100 text-emerald-900',
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: process.env.TIMEZONE || 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: process.env.TIMEZONE || 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;

  const supabase = await createClient();
  const admin = createAdminClient();

  // Motion — include all timestamp + FK columns needed for timeline
  const { data: motion } = await supabase
    .from('motions')
    .select('id, motion_number, title, description, status, result, created_by, moved_by, seconded_by, ratified_by, created_at, published_at, moved_at, seconded_at, voting_opened_at, decided_at, ratified_at, withdrawn_at')
    .eq('id', id)
    .maybeSingle();

  if (!motion) notFound();

  // Member name map (small roster — fetch all once)
  const { data: membersData } = await supabase.from('members').select('id, full_name');
  const memberMap = Object.fromEntries((membersData ?? []).map((m) => [m.id, m.full_name]));

  // Attachments with storage path for signed URLs
  const { data: attachments } = await supabase
    .from('motion_attachments')
    .select('id, file_name, file_size, content_type, file_hash, storage_path, uploaded_at')
    .eq('motion_id', id)
    .order('uploaded_at');

  // Signed download URLs (1-hour expiry, generated server-side via admin)
  const signedUrls: Record<string, string> = {};
  for (const att of attachments ?? []) {
    const { data } = await admin.storage
      .from('motion-attachments')
      .createSignedUrl(att.storage_path, 3600);
    if (data?.signedUrl) signedUrls[att.id] = data.signedUrl;
  }

  // Comments with member_id (names looked up from memberMap)
  const { data: comments } = await supabase
    .from('comments')
    .select('id, body, created_at, member_id')
    .eq('motion_id', id)
    .order('created_at');

  // Activity timeline derived from motion columns
  type TimelineEvent = { at: string; label: string };
  const rawEvents: (TimelineEvent | null)[] = [
    { at: motion.created_at, label: `Created by ${memberMap[motion.created_by] ?? 'unknown'}` },
    motion.published_at
      ? { at: motion.published_at, label: 'Published — open for motions' }
      : null,
    motion.moved_at
      ? { at: motion.moved_at, label: `Moved by ${memberMap[motion.moved_by ?? ''] ?? 'unknown'}` }
      : null,
    motion.seconded_at
      ? {
          at: motion.seconded_at,
          label: `Seconded by ${memberMap[motion.seconded_by ?? ''] ?? 'unknown'}`,
        }
      : null,
    motion.voting_opened_at ? { at: motion.voting_opened_at, label: 'Voting opened' } : null,
    motion.decided_at
      ? {
          at: motion.decided_at,
          label: `Decided: ${
            motion.result === 'passed'
              ? 'Passed (provisional)'
              : motion.result === 'failed'
                ? 'Failed (provisional)'
                : motion.result === 'deferred'
                  ? 'Deferred to in-person'
                  : 'Closed'
          }`,
        }
      : null,
    motion.ratified_at
      ? {
          at: motion.ratified_at,
          label: `Ratified by ${memberMap[motion.ratified_by ?? ''] ?? 'unknown'}`,
        }
      : null,
    motion.withdrawn_at ? { at: motion.withdrawn_at, label: 'Withdrawn' } : null,
  ];
  const timeline = (rawEvents.filter(Boolean) as TimelineEvent[]).sort((a, b) =>
    a.at.localeCompare(b.at),
  );

  const statusLabel = STATUS_LABELS[motion.status] ?? motion.status;
  const statusTone = STATUS_TONE[motion.status] ?? 'bg-neutral-100 text-neutral-700';
  const isChair = member.role === 'chair';
  const hasAction = motion.status === 'open' || motion.status === 'moved';

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide">
            {motion.motion_number}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{motion.title}</h1>
          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone}`}
          >
            {statusLabel}
          </span>
        </div>
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Back
        </Link>
      </div>

      {/* ── Action card ─────────────────────────────────────────────────── */}
      {hasAction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isChair ? 'Status' : 'Your action'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MotionActions
              motionId={motion.id}
              status={motion.status}
              isChair={isChair}
              currentMemberId={member.id}
              movedById={motion.moved_by}
              moverName={motion.moved_by ? (memberMap[motion.moved_by] ?? null) : null}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Description ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{motion.description}</p>
        </CardContent>
      </Card>

      {/* ── Attachments ─────────────────────────────────────────────────── */}
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
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.file_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(a.file_size)} · sha256&nbsp;{a.file_hash.slice(0, 12)}…
                    </p>
                  </div>
                  {signedUrls[a.id] && (
                    <a
                      href={signedUrls[a.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Open
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Discussion ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {comments && comments.length > 0 ? (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c.id} className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">
                      {memberMap[c.member_id] ?? 'Board member'}
                    </span>
                    <span className="text-muted-foreground text-xs">{formatDate(c.created_at)}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No comments yet.</p>
          )}
          <div className="border-t pt-3">
            <CommentForm motionId={motion.id} />
          </div>
        </CardContent>
      </Card>

      {/* ── Activity ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {timeline.map((event, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums pt-0.5">
                  {formatTs(event.at)}
                </span>
                <span>{event.label}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
