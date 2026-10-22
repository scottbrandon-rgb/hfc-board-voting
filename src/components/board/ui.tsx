import Link from 'next/link';
import { Calendar, Check, Clock, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { LinkPending } from '@/components/board/link-pending';
import type { ChipIcon, Progress, StatusChipInfo, Tone } from '@/lib/rules';

// Server-safe building blocks shared by every screen.

export function Monogram({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-brand inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39) }}
    >
      HF
    </span>
  );
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-chip text-ink-2',
  brand: 'bg-brand-soft text-brand',
  'brand-solid': 'bg-brand text-white',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  dashed: 'border border-dashed border-faint text-ink-2',
};

function ChipGlyph({ icon }: { icon: ChipIcon }) {
  const cls = 'size-3.5';
  if (icon === 'check') return <Check className={cls} strokeWidth={3} aria-hidden="true" />;
  if (icon === 'message')
    return <MessageCircle className={cls} strokeWidth={2.5} aria-hidden="true" />;
  if (icon === 'clock') return <Clock className={cls} strokeWidth={2.5} aria-hidden="true" />;
  if (icon === 'calendar') return <Calendar className={cls} strokeWidth={2.5} aria-hidden="true" />;
  return null;
}

export function Chip({
  tone,
  icon = null,
  children,
  className,
}: {
  tone: Tone;
  icon?: ChipIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-caption inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      <ChipGlyph icon={icon} />
      {children}
    </span>
  );
}

export function StatusChip({ info, className }: { info: StatusChipInfo; className?: string }) {
  return (
    <Chip tone={info.tone} icon={info.icon} className={className}>
      {info.label}
    </Chip>
  );
}

/** Five segments (one per voting member): Aye, other ballots, not yet voted. */
export function UnanimityBar({ progress, thick = false }: { progress: Progress; thick?: boolean }) {
  const label = `${progress.ayes} of ${progress.electorate} voted Aye${
    progress.others ? `, ${progress.others} asked to discuss` : ''
  }${progress.waiting ? `, ${progress.waiting} not yet voted` : ''}`;
  return (
    <div
      role="img"
      aria-label={label}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(progress.electorate, 1)}, minmax(0, 1fr))` }}
    >
      {progress.segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            'block rounded-full',
            thick ? 'h-2.5' : 'h-2',
            seg === 'aye' ? 'bg-good-bar' : seg === 'other' ? 'bg-warn-bar' : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section className={cn('border-line rounded-2xl border bg-white p-4', className)} {...rest}>
      {children}
    </section>
  );
}

export function SectionHeading({
  id,
  children,
  action,
}: {
  id?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-body font-semibold">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Avatar({ name, highlight = false }: { name: string; highlight?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'text-caption flex size-9 shrink-0 items-center justify-center rounded-full font-semibold',
        highlight ? 'bg-brand-soft text-brand' : 'bg-chip text-ink-2',
      )}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-line-strong text-small text-ink-2 rounded-2xl border border-dashed bg-white/60 px-4 py-8 text-center">
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-display font-bold tracking-tight">{children}</h1>
      {subtitle && <p className="text-body text-ink-3">{subtitle}</p>}
    </div>
  );
}

/** A tappable card row linking to a motion. */
export function MotionLinkCard({
  href,
  chip,
  number,
  title,
  detail,
}: {
  href: string;
  chip: React.ReactNode;
  number: string;
  title: string;
  detail?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="border-line focus-visible:ring-brand/40 flex flex-col gap-2 rounded-2xl border bg-white p-4 transition-shadow outline-none hover:shadow-sm focus-visible:ring-3"
    >
      <span className="flex items-center justify-between gap-2">
        {chip}
        <span className="text-caption text-ink-3">{number}</span>
      </span>
      <span className="text-body leading-snug font-semibold">{title}</span>
      {detail && <span className="text-small text-ink-2">{detail}</span>}
      <LinkPending />
    </Link>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-small text-danger">
      {children}
    </p>
  );
}
