import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DraftActions } from './_components/draft-actions';
import { MotionActions } from './_components/motion-actions';
import { VotingPanel } from './_components/voting-panel';
import { ChairActions } from './_components/chair-actions';
import { CommentForm } from './_components/comment-form';
import { getPdfSignedUrl } from '@/lib/generate-pdf';

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
  archived: 'Archived',
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
  archived: 'bg-neutral-100 text-neutral-500',
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

  // Vote data — only needed for voting/decided/ratified statuses
  const VOTE_STATUSES = ['voting', 'decided_passed', 'decided_failed', 'decided_deferred', 'ratified'];
  let myVote: string | null = null;
  let tally = { aye: 0, nay: 0, abstain: 0, defer: 0 };
  let totalVoters = 0;

  if (VOTE_STATUSES.includes(motion.status)) {
    const { data: votes } = await supabase
      .from('votes')
      .select('member_id, vote')
      .eq('motion_id', id);

    myVote = (votes ?? []).find((v) => v.member_id === member.id)?.vote ?? null;
    for (const v of votes ?? []) {
      if (v.vote === 'aye') tally.aye++;
      else if (v.vote === 'nay') tally.nay++;
      else if (v.vote === 'abstain') tally.abstain++;
      else if (v.vote === 'defer') tally.defer++;
    }

    const { count } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('role', 'member');

    totalVoters = count ?? 0;
  }

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

  // PDF download — only chair and secretary can download
  const PDF_STATUSES = ['decided_passed', 'decided_failed', 'decided_deferred', 'ratified'];
  const canDownloadPdf = member.role === 'chair' || member.role === 'secretary';
  const pdfSignedUrl =
    canDownloadPdf && PDF_STATUSES.includes(motion.status)
      ? await getPdfSignedUrl(motion.id)
      : null;

  const statusLabel = STATUS_LABELS[motion.status] ?? motion.status;
  const statusTone = STATUS_TONE[motion.status] ?? 'bg-neutral-100 text-neutral-700';
  const isChair = member.role === 'chair';
  const isDraft = motion.status === 'draft';
  const hasAction = motion.status === 'open' || motion.status === 'moved';
  const hasVotingPanel = motion.status === 'seconded' || motion.status === 'voting';
  const hasChairActions = [
    'decided_passed', 'decided_failed', 'decided_deferred',
    'ratified', 'archived', 'withdrawn', 'died_no_motion', 'died_no_second',
  ].includes(motion.status);
  const showVoteResults = ['decided_passed', 'decided_failed', 'decided_deferred', 'ratified'].includes(motion.status);

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
      </div>

      {/* ── Draft actions (chair: publish / delete) ─────────────────────── */}
      {isDraft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <DraftActions motionId={motion.id} isChair={isChair} />
          </CardContent>
        </Card>
      )}

      {/* ── Action card (open / moved) ──────────────────────────────────── */}
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

      {/* ── Voting card (seconded / voting) ─────────────────────────────── */}
      {hasVotingPanel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {motion.status === 'seconded'
                ? isChair
                  ? 'Open voting'
                  : 'Awaiting vote'
                : isChair
                  ? 'Voting in progress'
                  : myVote
                    ? 'Your vote'
                    : 'Cast your vote'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VotingPanel
              motionId={motion.id}
              status={motion.status}
              isChair={isChair}
              currentMemberId={member.id}
              myVote={myVote}
              tally={tally}
              totalVoters={totalVoters}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Chair / outcome actions (decided / ratified) ────────────────── */}
      {hasChairActions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {motion.status === 'ratified'
                ? 'Ratification'
                : motion.status === 'decided_passed'
                  ? isChair
                    ? 'Ratify motion'
                    : 'Outcome'
                  : 'Outcome'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChairActions
              motionId={motion.id}
              status={motion.status}
              isChair={isChair}
              ratifiedByName={motion.ratified_by ? (memberMap[motion.ratified_by] ?? null) : null}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Vote results (decided / ratified) ───────────────────────────── */}
      {showVoteResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vote results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <div className="rounded-md bg-emerald-50 px-2 py-2">
                <p className="text-lg font-semibold text-emerald-800">{tally.aye}</p>
                <p className="text-xs text-emerald-700">Aye</p>
              </div>
              <div className="rounded-md bg-red-50 px-2 py-2">
                <p className="text-lg font-semibold text-red-800">{tally.nay}</p>
                <p className="text-xs text-red-700">Nay</p>
              </div>
              <div className="rounded-md bg-neutral-100 px-2 py-2">
                <p className="text-lg font-semibold text-neutral-700">{tally.abstain}</p>
                <p className="text-xs text-neutral-600">Abstain</p>
              </div>
              <div className="rounded-md bg-purple-50 px-2 py-2">
                <p className="text-lg font-semibold text-purple-800">{tally.defer}</p>
                <p className="text-xs text-purple-700">Defer</p>
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-xs text-right">
              {tally.aye + tally.nay + tally.abstain + tally.defer} of {totalVoters} member
              {totalVoters !== 1 ? 's' : ''} voted
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── PDF download ────────────────────────────────────────────────── */}
      {pdfSignedUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Motion record</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              {motion.status === 'ratified'
                ? 'Final ratified record with completed ratification block.'
                : 'Provisional record — pending ratification at the next in-person session.'}
            </p>
            <a
              href={pdfSignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`${motion.motion_number}.pdf`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Download PDF
            </a>
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
            <CardTitle className="text-base">
              Attachments
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                · links expire in 1 hour
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {attachments.map((a) => {
                const isPdf = a.content_type === 'application/pdf';
                const isImage = a.content_type?.startsWith('image/');
                const typeIcon = isPdf ? '📄' : isImage ? '🖼️' : '📎';
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-base leading-none">{typeIcon}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.file_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatBytes(a.file_size)} · sha256&nbsp;{a.file_hash.slice(0, 12)}…
                        </p>
                      </div>
                    </div>
                    {signedUrls[a.id] ? (
                      <a
                        href={signedUrls[a.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={a.file_name}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">Unavailable</span>
                    )}
                  </li>
                );
              })}
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
                      {c.member_id ? (memberMap[c.member_id] ?? 'Board member') : 'Former board member'}
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
