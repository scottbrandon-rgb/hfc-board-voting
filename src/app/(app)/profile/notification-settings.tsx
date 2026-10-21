'use client';

import { useState, useTransition } from 'react';
import { ErrorText } from '@/components/board/ui';
import { cn } from '@/lib/utils';
import { setNotificationPreference, type NotificationPref } from './actions';

const SETTINGS: { pref: NotificationPref; title: string; detail: string }[] = [
  {
    pref: 'notify_new_motions',
    title: 'New motions',
    detail: 'When a motion is published or the chair calls for a motion',
  },
  {
    pref: 'notify_results',
    title: 'Results',
    detail: 'When a vote is approved, referred or ratified',
  },
  { pref: 'notify_comments', title: 'Comments', detail: 'When someone comments on a motion' },
];

function Switch({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-8 w-13 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand' : 'bg-line-strong',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'absolute size-6 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </span>
  );
}

/**
 * Email preferences. Emails asking for the member's vote, and reminders before
 * a deadline, always go out: a unanimous vote depends on every member.
 */
export function NotificationSettings({ initial }: { initial: Record<NotificationPref, boolean> }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (pref: NotificationPref) => {
    const next = !values[pref];
    setValues((v) => ({ ...v, [pref]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setNotificationPreference(pref, next);
      if (result.status === 'error') {
        setValues((v) => ({ ...v, [pref]: !next }));
        setError(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col">
      <div className="border-line flex min-h-[72px] items-center gap-3 border-b py-3">
        <span className="flex flex-1 flex-col">
          <span className="text-body font-semibold">Votes needing me and reminders</span>
          <span className="text-small text-ink-2">
            Always on, so no vote waits on a missed email
          </span>
        </span>
        <Switch checked disabled />
      </div>
      {SETTINGS.map((s, i) => (
        <button
          key={s.pref}
          type="button"
          role="switch"
          aria-checked={values[s.pref]}
          disabled={pending}
          onClick={() => toggle(s.pref)}
          className={cn(
            'focus-visible:ring-brand/40 flex min-h-[72px] items-center gap-3 py-3 text-left outline-none focus-visible:ring-3',
            i < SETTINGS.length - 1 && 'border-line border-b',
          )}
        >
          <span className="flex flex-1 flex-col">
            <span className="text-body font-semibold">{s.title}</span>
            <span className="text-small text-ink-2">{s.detail}</span>
          </span>
          <Switch checked={values[s.pref]} />
        </button>
      ))}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
