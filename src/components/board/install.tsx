'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/board/sheet';

const DISMISSED_KEY = 'hfc-install-dismissed';

type Platform = 'ios' | 'android' | 'other';

function detect(): { platform: Platform; installed: boolean } {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { platform: ios ? 'ios' : android ? 'android' : 'other', installed };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span
        aria-hidden="true"
        className="bg-brand-soft text-brand text-small flex size-8 shrink-0 items-center justify-center rounded-full font-bold"
      >
        {n}
      </span>
      <span className="text-body flex-1">{children}</span>
    </li>
  );
}

function AppIcon({ size = 56 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="bg-brand flex shrink-0 items-center justify-center font-bold text-white"
      style={{ width: size, height: size, borderRadius: size * 0.23, fontSize: size * 0.34 }}
    >
      HF
    </span>
  );
}

export function InstallSheet({
  open,
  onOpenChange,
  platform,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: Platform;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add to Home Screen"
      description={
        platform === 'android' ? 'On Android, in Chrome' : 'On iPhone or iPad, in Safari'
      }
    >
      <div className="flex items-center gap-3">
        <AppIcon />
        <p className="text-small text-ink-2">
          The HF icon opens the board site full screen, like an app.
        </p>
      </div>
      {platform === 'android' ? (
        <ol className="flex flex-col gap-3.5">
          <Step n={1}>Tap the ⋮ menu in Chrome</Step>
          <Step n={2}>
            Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>
          </Step>
          <Step n={3}>
            Tap <strong>Install</strong>
          </Step>
        </ol>
      ) : (
        <ol className="flex flex-col gap-3.5">
          <Step n={1}>
            <span className="inline-flex items-center gap-2">
              Tap the Share button
              <Share className="text-brand size-5" aria-label="(the square with an arrow)" />
            </span>
          </Step>
          <Step n={2}>
            Scroll down and tap <strong>Add to Home Screen</strong>
          </Step>
          <Step n={3}>
            Tap <strong>Add</strong>. The HF icon appears on your home screen.
          </Step>
        </ol>
      )}
      <p className="bg-page text-small text-ink-2 rounded-xl px-4 py-3">
        You may be asked to sign in once inside the app. Links in board emails open in your browser.
      </p>
      <Button size="lg" onClick={() => onOpenChange(false)}>
        Got it
      </Button>
    </Sheet>
  );
}

/** One-time card on Home for iPhone users (Android offers its own install prompt). */
export function InstallCard() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const { platform, installed } = detect();
    // Reading the platform is only possible in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(platform === 'ios' && !installed && !readDismissed());
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing: the card simply shows again next time.
    }
    setShow(false);
  };

  return (
    <aside
      aria-label="Add to Home Screen"
      className="border-line flex flex-col gap-3 rounded-2xl border bg-white p-4"
    >
      <div className="flex items-center gap-3">
        <AppIcon size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-semibold">Add the board app to your phone</span>
          <span className="text-small text-ink-2">One tap to open, like any other app.</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={dismiss}>
          Not now
        </Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Show me how
        </Button>
      </div>
      <InstallSheet open={open} onOpenChange={setOpen} platform="ios" />
    </aside>
  );
}

/** The Profile row; always available unless already installed. */
export function InstallRow() {
  const [state, setState] = useState<{ platform: Platform; installed: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(detect());
  }, []);

  if (state?.installed) {
    return (
      <div className="border-line flex min-h-[72px] items-center gap-3.5 rounded-2xl border bg-white px-4">
        <AppIcon size={44} />
        <div className="flex flex-col">
          <span className="text-body font-semibold">Installed on this device</span>
          <span className="text-small text-ink-2">
            You opened the board app from your home screen.
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line focus-visible:ring-brand/40 flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border bg-white px-4 py-3 text-left outline-none focus-visible:ring-3"
      >
        <AppIcon size={44} />
        <span className="flex flex-1 flex-col">
          <span className="text-body font-semibold">Add to Home Screen</span>
          <span className="text-small text-ink-2">Open the board app with one tap</span>
        </span>
        <ChevronRight className="text-ink-3 size-5" aria-hidden="true" />
      </button>
      <InstallSheet open={open} onOpenChange={setOpen} platform={state?.platform ?? 'ios'} />
    </>
  );
}
