'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/input';
import { SubmitButton } from '@/components/board/submit-button';
import { ErrorText } from '@/components/board/ui';
import { postComment, type ActionState } from '../actions';

const idle: ActionState = { status: 'idle' };

export function CommentForm({ motionId }: { motionId: string }) {
  const [state, action] = useActionState(postComment.bind(null, motionId), idle);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <label htmlFor="comment" className="text-base font-semibold">
        Add a comment
      </label>
      <Textarea
        id="comment"
        name="body"
        rows={2}
        maxLength={4000}
        required
        placeholder="Ask a question or share a thought"
      />
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <SubmitButton variant="outline" className="self-end" pendingText="Posting…">
        Post comment
      </SubmitButton>
    </form>
  );
}
