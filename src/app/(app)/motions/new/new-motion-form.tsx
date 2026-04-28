'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMotion, type CreateMotionState } from './actions';

const initialState: CreateMotionState = { status: 'idle' };
const MAX_FILES = 4;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function NewMotionForm() {
  const [state, formAction, pending] = useActionState(createMotion, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    const combined = [...selectedFiles, ...incoming].slice(0, MAX_FILES);

    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`"${f.name}" is over the 25 MB limit.`);
        e.target.value = '';
        return;
      }
    }

    if (selectedFiles.length + incoming.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} attachments per motion.`);
    } else {
      setFileError(null);
    }
    setSelectedFiles(combined);
    e.target.value = '';
    syncInputFiles(combined);
  }

  function removeFile(index: number) {
    const next = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(next);
    setFileError(null);
    syncInputFiles(next);
  }

  function syncInputFiles(files: File[]) {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    fileInputRef.current.files = dt.files;
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          placeholder="e.g. Approve purchase of 24-passenger Bluebird bus"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Description <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="description"
          name="description"
          required
          rows={8}
          placeholder="Full text of the motion. Include context, rationale, and any references."
          disabled={pending}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-muted-foreground text-xs">Plain text. Line breaks are preserved.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachments">Attachments</Label>
        <input
          ref={fileInputRef}
          id="attachments"
          name="attachments"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.md"
          onChange={onFileChange}
          disabled={pending || selectedFiles.length >= MAX_FILES}
          className="file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-muted-foreground text-xs">
          Up to {MAX_FILES} files, 25 MB each. PDFs, Office docs, and images.
        </p>
        {fileError && (
          <p className="text-destructive text-sm" role="alert">
            {fileError}
          </p>
        )}
        {selectedFiles.length > 0 && (
          <ul className="divide-y rounded-md border">
            {selectedFiles.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{f.name}</p>
                  <p className="text-muted-foreground text-xs">{formatBytes(f.size)}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeFile(i)}
                  disabled={pending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-between">
        <Link
          href="/"
          className={buttonVariants({ variant: 'ghost', className: 'h-11 px-4 sm:order-first' })}
        >
          Cancel
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            name="publish"
            value="false"
            variant="outline"
            className="h-11 px-4"
            disabled={pending}
          >
            Save as draft
          </Button>
          <Button
            type="submit"
            name="publish"
            value="true"
            className="h-11 px-4"
            disabled={pending}
          >
            {pending ? 'Working…' : 'Publish'}
          </Button>
        </div>
      </div>
    </form>
  );
}
