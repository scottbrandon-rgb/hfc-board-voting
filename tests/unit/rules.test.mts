// Unit tests for the shared rules vocabulary. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_STATUSES,
  AGENDA_STATUSES,
  commentsOpen,
  computeProgress,
  isFinal,
  isVotingRole,
  progressSummary,
  REFERRED_STATUSES,
  statusChip,
  TO_RATIFY_STATUSES,
  votingChip,
} from '../../src/lib/rules.ts';

const FIVE = ['a', 'b', 'c', 'd', 'e'];

test('the chair does not vote online; members and the secretary do', () => {
  assert.equal(isVotingRole('chair'), false);
  assert.equal(isVotingRole('secretary'), true);
  assert.equal(isVotingRole('member'), true);
});

test('progress counts only the electorate, ayes first', () => {
  const p = computeProgress(FIVE, [
    { member_id: 'a', vote: 'aye' },
    { member_id: 'b', vote: 'discuss' },
    { member_id: 'c', vote: 'aye' },
    { member_id: 'chair', vote: 'aye' }, // not in the electorate: ignored
  ]);
  assert.equal(p.ayes, 2);
  assert.equal(p.others, 1);
  assert.equal(p.waiting, 2);
  assert.equal(p.electorate, 5);
  assert.deepEqual(p.segments, ['aye', 'aye', 'other', 'waiting', 'waiting']);
  assert.equal(progressSummary(p), '2 of 5 Aye · 1 asked to discuss · waiting on 2');
});

test('five ayes of five is unanimous', () => {
  const p = computeProgress(
    FIVE,
    FIVE.map((id) => ({ member_id: id, vote: 'aye' })),
  );
  assert.equal(p.ayes, 5);
  assert.equal(p.waiting, 0);
  assert.equal(progressSummary(p), '5 of 5 Aye');
});

test('a vacant seat shrinks the electorate', () => {
  const p = computeProgress(['a', 'b', 'c', 'd'], [{ member_id: 'a', vote: 'aye' }]);
  assert.equal(p.electorate, 4);
  assert.equal(p.segments.length, 4);
});

test('legacy ballots (nay, abstain) count as not Aye', () => {
  const p = computeProgress(FIVE, [
    { member_id: 'a', vote: 'nay' },
    { member_id: 'b', vote: 'abstain' },
  ]);
  assert.equal(p.ayes, 0);
  assert.equal(p.others, 2);
});

test('every status has a chip label', () => {
  for (const s of [
    'draft',
    'open',
    'moved',
    'seconded',
    'voting',
    'approved',
    'referred',
    'ratified',
    'decided_in_person',
    'withdrawn',
    'decided_passed',
    'decided_failed',
    'decided_deferred',
    'died_no_motion',
    'died_no_second',
  ]) {
    const chip = statusChip(s);
    assert.ok(chip.label.length > 0, s);
  }
});

test('the voting chip asks for the viewer when they still need to vote', () => {
  const p = computeProgress(FIVE, []);
  const mine = votingChip(p, true);
  const theirs = votingChip(p, false);
  assert.notEqual(mine.label, theirs.label);
});

test('status groups do not overlap where they must not', () => {
  for (const s of APPROVED_STATUSES) assert.ok(!REFERRED_STATUSES.includes(s), s);
  for (const s of AGENDA_STATUSES) assert.ok(REFERRED_STATUSES.includes(s), s);
  for (const s of TO_RATIFY_STATUSES) assert.ok(APPROVED_STATUSES.includes(s), s);
});

test('comments close once a motion is settled', () => {
  assert.equal(commentsOpen('voting'), true);
  assert.equal(commentsOpen('referred'), true);
  assert.equal(commentsOpen('approved'), true);
  assert.equal(commentsOpen('draft'), false);
  assert.equal(commentsOpen('ratified'), false);
  assert.equal(commentsOpen('decided_in_person'), false);
  assert.equal(commentsOpen('decided_passed'), false);
  assert.equal(isFinal('withdrawn'), true);
  assert.equal(isFinal('voting'), false);
});
