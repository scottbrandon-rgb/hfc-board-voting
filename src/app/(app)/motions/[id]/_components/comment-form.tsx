'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { postComment, type CommentState } from '../actions';

const initialState: CommentState = { status: 'idle' };

export function CommentForm({ motionId }: { motionId: string }) {
  const [state, formAction, pending] = useActionState(
    postComment.bind(null, motionId),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 pt-2">
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Add a comment…"
        disabled={pending}
        maxLength={4000}
        className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {state.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
