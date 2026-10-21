'use client';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

/**
 * A bottom sheet: within thumb reach on phones, centered along the bottom of
 * wider screens. Focus stays inside while open; Escape or the close button
 * dismisses it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-ink/50 fixed inset-0 z-40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white px-5 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div
            aria-hidden="true"
            className="bg-line-strong mx-auto h-1.5 w-10 shrink-0 rounded-full"
          />
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Dialog.Title className="text-title font-bold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-small text-ink-3">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="bg-chip text-ink-2 hover:bg-line focus-visible:ring-brand/40 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
