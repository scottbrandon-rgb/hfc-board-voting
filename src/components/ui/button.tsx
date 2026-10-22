import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Sizes follow the board's touch-target rule: 44px minimum, 48px for most
// buttons, 56px for the main action on a screen.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand-ink',
        outline: 'border-line-strong bg-white text-ink hover:bg-page',
        secondary: 'bg-brand-soft text-brand hover:bg-[#dbe4f8]',
        ghost: 'text-brand hover:bg-brand-soft',
        destructive: 'bg-danger-soft text-danger hover:bg-[#f6d9d4]',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-12 px-5 text-base',
        sm: 'h-11 px-4 text-base',
        lg: 'h-14 rounded-2xl px-6 text-body',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
