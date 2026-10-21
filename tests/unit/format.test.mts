// Unit tests for board-time formatting. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardLocalToIso,
  closingWithin,
  formatBytes,
  formatPlainDate,
  initials,
  isoToBoardLocal,
  timeLeft,
  todayInBoardTz,
} from '../../src/lib/format.ts';
import { safeNext } from '../../src/lib/safe-next.ts';
import { cn, escapeLike } from '../../src/lib/utils.ts';

const NOW = new Date('2026-10-21T15:00:00Z');

test('time left reads naturally', () => {
  assert.equal(timeLeft('2026-10-24T15:00:00Z', NOW), '3 days left');
  assert.equal(timeLeft('2026-10-22T14:00:00Z', NOW), '23 hours left');
  assert.equal(timeLeft('2026-10-21T16:30:00Z', NOW), '1 hour left');
  assert.equal(timeLeft('2026-10-21T15:10:00Z', NOW), '10 minutes left');
  assert.equal(timeLeft('2026-10-21T15:00:30Z', NOW), 'Less than a minute left');
  assert.equal(timeLeft('2026-10-21T14:59:00Z', NOW), 'Closed');
});

test('closing within a window', () => {
  assert.equal(closingWithin('2026-10-22T14:00:00Z', 24, NOW), true);
  assert.equal(closingWithin('2026-10-23T14:00:00Z', 24, NOW), false);
  assert.equal(closingWithin('2026-10-21T14:00:00Z', 24, NOW), false);
});

test('board-local datetime round-trips through UTC (Central time)', () => {
  // Central Daylight Time (UTC-5)
  assert.equal(boardLocalToIso('2026-10-21T19:00'), '2026-10-22T00:00:00.000Z');
  assert.equal(isoToBoardLocal('2026-10-22T00:00:00.000Z'), '2026-10-21T19:00');
  // Central Standard Time (UTC-6), after the November change
  assert.equal(boardLocalToIso('2026-11-12T19:00'), '2026-11-13T01:00:00.000Z');
  assert.equal(isoToBoardLocal('2026-11-13T01:00:00.000Z'), '2026-11-12T19:00');
  assert.equal(boardLocalToIso('not a date'), null);
});

test('today in board time differs from UTC late in the evening', () => {
  assert.equal(todayInBoardTz(new Date('2026-10-22T03:00:00Z')), '2026-10-21');
});

test('plain dates do not shift by time zone', () => {
  assert.equal(formatPlainDate('2026-11-09'), 'Nov 9, 2026');
});

test('initials and sizes', () => {
  assert.equal(initials('Mary Ann Smith'), 'MS');
  assert.equal(initials('Cher'), 'C');
  assert.equal(initials('  '), '?');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

test('sign-in only returns to pages on this site', () => {
  assert.equal(safeNext('/motions/abc'), '/motions/abc');
  assert.equal(safeNext('/motions?filter=open'), '/motions?filter=open');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext('/\\evil.example'), '/');
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext('/login'), '/');
  assert.equal(safeNext(null), '/');
});

test('email lookups treat LIKE wildcards literally', () => {
  assert.equal(escapeLike('j_hn@x.org'), 'j\\_hn@x.org');
  assert.equal(escapeLike('a%b@x.org'), 'a\\%b@x.org');
  assert.equal(escapeLike('plain@x.org'), 'plain@x.org');
});

test('class merging keeps text colors alongside the board text sizes', () => {
  assert.equal(cn('bg-brand text-white', 'text-body'), 'bg-brand text-white text-body');
  assert.equal(cn('text-caption', 'text-ink-2'), 'text-caption text-ink-2');
  assert.equal(cn('text-small', 'text-body'), 'text-body');
  assert.equal(cn('text-ink', 'text-white'), 'text-white');
});
