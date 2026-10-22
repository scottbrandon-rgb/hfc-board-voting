// Date and time formatting in the board's time zone. Server and browser share
// these helpers so every screen, email and PDF shows the same Central time.

export const TIMEZONE =
  process.env.NEXT_PUBLIC_TIMEZONE || process.env.TIMEZONE || 'America/Chicago';

function fmt(iso: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, ...options }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}

/** "Thu, Oct 29 at 3:00 PM" */
export function formatDateTime(iso: string | Date): string {
  return `${fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmt(iso, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

/** "Oct 29, 2026" */
export function formatDate(iso: string | Date): string {
  return fmt(iso, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Thursday, October 29" */
export function formatLongDate(iso: string | Date): string {
  return fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Tue 9:14 AM" — for recent activity. */
export function formatShort(iso: string | Date): string {
  return `${fmt(iso, { weekday: 'short' })} ${fmt(iso, { hour: 'numeric', minute: '2-digit' })}`;
}

/** A calendar date stored as YYYY-MM-DD, shown as "Nov 9, 2026". */
export function formatPlainDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Today's date in the board's time zone, as YYYY-MM-DD. */
export function todayInBoardTz(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** "2 days left", "6 hours left", "45 minutes left", "Closed". */
export function timeLeft(deadline: string | Date, now: Date = new Date()): string {
  const ms = new Date(deadline).getTime() - now.getTime();
  if (ms <= 0) return 'Closed';
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 2) return `${days} days left`;
  if (hours >= 2) return `${hours} hours left`;
  if (hours === 1) return '1 hour left';
  if (minutes >= 2) return `${minutes} minutes left`;
  return 'Less than a minute left';
}

/** True when a deadline is within the next `hours`. */
export function closingWithin(
  deadline: string | Date,
  hours: number,
  now: Date = new Date(),
): boolean {
  const ms = new Date(deadline).getTime() - now.getTime();
  return ms > 0 && ms <= hours * 3_600_000;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Good morning" / "Good afternoon" / "Good evening" in the board's time zone. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(fmt(now, { hour: 'numeric', hour12: false }));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Minutes the board's time zone is ahead of UTC at the given moment. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** A <input type="datetime-local"> value, read as board time, as an ISO instant. */
export function boardLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - tzOffsetMinutes(new Date(guess)) * 60_000;
  // Second pass settles times near a daylight-saving change.
  utc = guess - tzOffsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
}

/** An ISO instant as a board-time value for <input type="datetime-local">. */
export function isoToBoardLocal(iso: string): string {
  const at = new Date(iso);
  const shifted = new Date(at.getTime() + tzOffsetMinutes(at) * 60_000);
  return shifted.toISOString().slice(0, 16);
}
