'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Paperclip, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorText } from '@/components/board/ui';
import { createClient } from '@/lib/supabase/client';
import { formatBytes } from '@/lib/format';
import {
  ACCEPTED_FILE_TYPES,
  DEFAULT_VOTING_PERIOD,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  VOTING_PERIOD_CHOICES,
} from '@/lib/rules';
import { prepareUpload, registerAttachment, removeAttachment, saveMotion } from './actions';
import { publishDraft } from '../[id]/actions';
import { cn } from '@/lib/utils';

export interface MotionFormInitial {
  motionId: string;
  title: string;
  description: string;
  background: string;
  votingPeriodDays: number;
  attachments: { id: string; file_name: string; file_size: number }[];
}

/**
 * New motion, or edit a draft. Documents upload straight from the browser to
 * private storage (no size limit from the web server), then the server
 * fingerprints and records each one.
 */
export function MotionForm({ initial }: { initial?: MotionFormInitial }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [background, setBackground] = useState(initial?.background ?? '');
  const [days, setDays] = useState(initial?.votingPeriodDays ?? DEFAULT_VOTING_PERIOD);
  const [existing, setExisting] = useState(initial?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Set once the draft exists, so saving again never creates a second motion.
  const [motionId, setMotionId] = useState<string | undefined>(initial?.motionId);
  const [error, setError] = useState<string | null>(null);

  const total = existing.length + files.length;

  function addFiles(list: FileList | null) {
    setError(null);
    const incoming = Array.from(list ?? []);
    const tooBig = incoming.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is over the 25 MB limit.`);
      return;
    }
    if (total + incoming.length > MAX_ATTACHMENTS) {
      setError(`A motion can have up to ${MAX_ATTACHMENTS} documents.`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  }

  async function removeExisting(id: string) {
    setError(null);
    const result = await removeAttachment(id);
    if (!result.ok) setError(result.message);
    else setExisting((prev) => prev.filter((a) => a.id !== id));
  }

  async function submit(publish: boolean) {
    setError(null);
    if (!title.trim()) return setError('Add a title.');
    if (!description.trim()) return setError('Add the motion text.');

    setBusy(publish ? 'Publishing…' : 'Saving…');
    const saved = await saveMotion({
      motionId,
      title,
      description,
      background,
      votingPeriodDays: days,
    });
    if (!saved.ok) {
      setBusy(null);
      return setError(saved.message);
    }
    const id = saved.motionId;
    setMotionId(id);

    const supabase = createClient();
    const queue = [...files];
    for (const [i, file] of queue.entries()) {
      setBusy(`Uploading ${i + 1} of ${queue.length}…`);
      const target = await prepareUpload(id, { name: file.name, size: file.size, type: file.type });
      if (!target.ok) {
        setBusy(null);
        return setError(`Your draft is saved, but ${target.message}`);
      }
      const { error: uploadError } = await supabase.storage
        .from('motion-attachments')
        .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
      const registered = uploadError
        ? {
            ok: false as const,
            message: `"${file.name}" did not upload. Check your connection and try again.`,
          }
        : await registerAttachment(id, { path: target.path, name: file.name });
      if (!registered.ok) {
        setBusy(null);
        return setError(`Your draft is saved, but ${registered.message}`);
      }
      // Uploaded: move it from the queue to the motion's documents.
      setFiles((prev) => prev.filter((f) => f !== file));
      setExisting((prev) => [
        ...prev,
        { id: registered.attachmentId, file_name: file.name, file_size: registered.size },
      ]);
    }

    if (publish) {
      const published = await publishDraft(id);
      if (published.status === 'error') {
        setBusy(null);
        return setError(`Your draft is saved, but it was not published: ${published.message}`);
      }
    }
    router.push(`/motions/${id}`);
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-6 pb-36 md:pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          placeholder="e.g. Replace the fellowship hall HVAC unit"
        />
        <p className="text-caption text-ink-3">Short and plain. This is what members see first.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Motion text</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={10000}
          required
          placeholder="That the board approve…"
        />
        <p className="text-caption text-ink-3">
          The exact words members agree to. Locked once you publish.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="background">
          Background <span className="text-ink-3 font-normal">(optional)</span>
        </Label>
        <Textarea
          id="background"
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          rows={3}
          maxLength={10000}
          placeholder="Why this is before the board, and anything members should know."
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold">
          Documents <span className="text-ink-3 font-normal">(optional)</span>
        </span>
        {(existing.length > 0 || files.length > 0) && (
          <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
            {existing.map((a) => (
              <li key={a.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <FileText className="text-ink-3 size-5 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base">{a.file_name}</span>
                  <span className="text-caption text-ink-3">{formatBytes(a.file_size)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${a.file_name}`}
                  onClick={() => removeExisting(a.id)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <FileText className="text-ink-3 size-5 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base">{f.name}</span>
                  <span className="text-caption text-ink-3">
                    {formatBytes(f.size)} · uploads when you save
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="sr-only"
          id="documents"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="border-faint text-brand h-14 border-dashed"
          disabled={total >= MAX_ATTACHMENTS}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden="true" />
          Add documents
        </Button>
        <p className="text-caption text-ink-3">PDF, Word, Excel or photos, up to 25 MB each.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Voting period</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#e6e8eb] p-1">
          {VOTING_PERIOD_CHOICES.map((d) => (
            <label
              key={d}
              className={cn(
                'has-[:focus-visible]:ring-brand/40 flex h-11 cursor-pointer items-center justify-center rounded-[9px] text-base font-semibold has-[:focus-visible]:ring-3',
                days === d ? 'text-ink bg-white shadow-sm' : 'text-ink-2',
              )}
            >
              <input
                type="radio"
                name="days"
                value={d}
                checked={days === d}
                onChange={() => setDays(d)}
                className="sr-only"
              />
              {d} days
            </label>
          ))}
        </div>
        <p className="text-caption text-ink-3">
          Voting closes {days} days after the motion is seconded, or as soon as every voting member
          votes Aye.
        </p>
      </fieldset>

      <p className="bg-brand-soft text-small text-brand-ink rounded-xl px-4 py-3">
        After you publish, the board is asked to move and second it. Voting opens automatically once
        it&apos;s seconded.
      </p>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="border-line fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2.5 border-t bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:flex md:justify-end md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" variant="outline" size="lg" disabled={busy !== null}>
          {busy && busy.startsWith('Sav') ? busy : 'Save draft'}
        </Button>
        <Button type="button" size="lg" disabled={busy !== null} onClick={() => submit(true)}>
          {busy && !busy.startsWith('Sav') ? busy : 'Publish'}
        </Button>
      </div>
      <Link
        href={motionId ? `/motions/${motionId}` : '/'}
        className={buttonVariants({ variant: 'ghost', className: 'self-start' })}
      >
        Cancel
      </Link>
    </form>
  );
}
