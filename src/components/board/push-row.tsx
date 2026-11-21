'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { ErrorText } from '@/components/board/ui';
import { cn } from '@/lib/utils';
import { removePushSubscription, savePushSubscription } from '@/app/(app)/profile/actions';

type State =
  | 'checking'
  | 'unsupported'
  | 'needs-install' // iPhone/iPad: push only works from the Home Screen app
  | 'blocked' // the member said no in the browser's permission prompt
  | 'off'
  | 'on';

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toInput(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

function isIosBrowser(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const COPY: Record<State, string> = {
  checking: 'Checking this device…',
  unsupported: 'This browser cannot receive push notifications.',
  'needs-install': 'On iPhone, first add the site to your Home Screen, then open it from there.',
  blocked: 'Blocked in this browser. Allow notifications for this site in its settings.',
  off: 'Get a notification when a motion, a call or a vote needs you',
  on: 'On for this device: motions, calls, votes and results',
};

/** The Profile switch for push notifications on the device in your hand. */
export function PushRow({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const set = (s: State) => {
        if (!cancelled) setState(s);
      };
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        set(isIosBrowser() && !isInstalled() ? 'needs-install' : 'unsupported');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        const sub = await registration.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') {
          // Keep the server's copy current (it drops addresses a push service
          // reports as gone). Quiet: no confirmation notice.
          await savePushSubscription(toInput(sub), false).catch(() => {});
          set('on');
        } else if (Notification.permission === 'denied') set('blocked');
        else set('off');
      } catch {
        set('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'blocked' : 'off');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const sub =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToBytes(publicKey),
          }));
        const result = await savePushSubscription(toInput(sub), true);
        if (result.status === 'error') {
          await sub.unsubscribe().catch(() => {});
          setError(result.message);
          return;
        }
        setState('on');
      } catch {
        setError('Could not turn on push notifications on this device. Please try again.');
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState('off');
      } catch {
        setError('Could not turn off push notifications. Please try again.');
      }
    });

  const interactive = state === 'off' || state === 'on';
  const checked = state === 'on';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={!interactive || pending}
        onClick={checked ? turnOff : turnOn}
        className="border-line focus-visible:ring-brand/40 flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border bg-white px-4 py-3 text-left outline-none focus-visible:ring-3 disabled:cursor-default"
      >
        <span className="bg-brand-soft text-brand flex size-11 shrink-0 items-center justify-center rounded-full">
          <Bell className="size-5" aria-hidden="true" />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-body font-semibold">Push notifications</span>
          <span className="text-small text-ink-2">{COPY[state]}</span>
        </span>
        {interactive && (
          <span
            aria-hidden="true"
            className={cn(
              'relative inline-flex h-8 w-13 shrink-0 items-center rounded-full transition-colors',
              checked ? 'bg-brand' : 'bg-line-strong',
              pending && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'absolute size-6 rounded-full bg-white shadow transition-transform',
                checked ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </span>
        )}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
