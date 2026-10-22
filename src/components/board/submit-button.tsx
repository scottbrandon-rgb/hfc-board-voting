'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

type ButtonProps = React.ComponentProps<typeof Button>;

/** A form's submit button that shows progress and blocks double taps. */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (pendingText ?? 'Saving…') : children}
    </Button>
  );
}
