import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

// 52px tall with 17px text: comfortable to tap, and large enough that phones
// do not zoom the page when the field is focused.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'border-line-strong placeholder:text-ink-3 focus-visible:border-brand focus-visible:ring-brand/30 aria-invalid:border-danger text-body text-ink h-[52px] w-full min-w-0 rounded-xl border bg-white px-3.5 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-line-strong placeholder:text-ink-3 focus-visible:border-brand focus-visible:ring-brand/30 aria-invalid:border-danger text-body text-ink w-full min-w-0 rounded-xl border bg-white px-3.5 py-3 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
