/**
 * Background jobs API route
 * Called every 15 minutes by the Netlify scheduled function.
 * Secured by CRON_SECRET — all requests must send:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Jobs:
 *  1. died_no_motion   — open motions with no mover after 72 h
 *  2. died_no_second   — moved motions with no seconder after 48 h
 *  3. auto_close_vote  — voting motions with no result after 48 h (auto-abstain + close as "passed" or "failed")
 *  4. vote_reminder    — send 24-hour reminder to members who haven't voted yet
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  notifyVotingClosed,
} from '@/lib/email';
import { Resend } from 'resend';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured → deny all
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

// ─── Email helpers (inline — avoids importing server-only email.ts fragments) ──

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const FROM = process.env.RESEND_FROM_EMAIL ?? 'board@harrisonfaith.org';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  if (!resend || to.length === 0) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[cron] email send failed:', err);
  }
}

function shell(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:20px 28px;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Harrison Faith Church</p>
          <p style="margin:4px 0 0;color:#a3a3a3;font-size:11px;">Board Voting Platform</p>
        </td></tr>
        <tr><td style="padding:28px 28px 20px;">${body}</td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;color:#a3a3a3;font-size:11px;line-height:1.6;">
            All electronic votes are provisional and non-binding. Final adoption requires ratification
            by the Board of Directors at the next regular in-person session.
          </p>
          <p style="margin:8px 0 0;color:#a3a3a3;font-size:11px;"><a href="${APP_URL}" style="color:#a3a3a3;">Board Voting Platform</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;background:#0a0a0a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">${label}</a>`;
}

// ─── Job 1: died_no_motion ────────────────────────────────────────────────────
// Motions in 'open' status with no mover after 72 hours → died_no_motion

async function jobDiedNoMotion(): Promise<string[]> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: motions, error } = await admin
    .from('motions')
    .select('id, motion_number, title')
    .eq('status', 'open')
    .lt('published_at', cutoff);

  if (error) {
    console.error('[cron:died_no_motion] query error:', error);
    return [];
  }
  if (!motions || motions.length === 0) return [];

  const ids = motions.map((m) => m.id);
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('motions')
    .update({ status: 'died_no_motion', decided_at: now })
    .in('id', ids)
    .eq('status', 'open'); // guard

  if (updateError) {
    console.error('[cron:died_no_motion] update error:', updateError);
    return [];
  }

  // Audit log each
  await admin.from('audit_log').insert(
    motions.map((m) => ({
      motion_id: m.id,
      member_id: null,
      event_type: 'died_no_motion',
      event_data: { motion_number: m.motion_number, reason: 'auto: 72h timeout, no mover' },
      ip_address: null,
      user_agent: 'cron',
    })),
  );

  // Notify all active members
  const { data: allMembers } = await admin.from('members').select('email').eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);

  for (const m of motions) {
    const url = `${APP_URL}/motions/${m.id}`;
    const html = shell(`
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">${m.motion_number}</p>
      <p style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">${m.title}</p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
        This motion was not formally moved within 72 hours of publication and has been marked
        <strong>Died — No Motion</strong>. No further action is required.
      </p>
      ${btn(url, 'View motion')}
    `);
    await sendEmail(emails, `[HFC Board] Motion expired: ${m.title}`, html);
  }

  return ids;
}

// ─── Job 2: died_no_second ───────────────────────────────────────────────────
// Motions in 'moved' status with no seconder after 48 hours → died_no_second

async function jobDiedNoSecond(): Promise<string[]> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: motions, error } = await admin
    .from('motions')
    .select('id, motion_number, title')
    .eq('status', 'moved')
    .lt('moved_at', cutoff);

  if (error) {
    console.error('[cron:died_no_second] query error:', error);
    return [];
  }
  if (!motions || motions.length === 0) return [];

  const ids = motions.map((m) => m.id);
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('motions')
    .update({ status: 'died_no_second', decided_at: now })
    .in('id', ids)
    .eq('status', 'moved');

  if (updateError) {
    console.error('[cron:died_no_second] update error:', updateError);
    return [];
  }

  await admin.from('audit_log').insert(
    motions.map((m) => ({
      motion_id: m.id,
      member_id: null,
      event_type: 'died_no_second',
      event_data: { motion_number: m.motion_number, reason: 'auto: 48h timeout, no seconder' },
      ip_address: null,
      user_agent: 'cron',
    })),
  );

  const { data: allMembers } = await admin.from('members').select('email').eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);

  for (const m of motions) {
    const url = `${APP_URL}/motions/${m.id}`;
    const html = shell(`
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">${m.motion_number}</p>
      <p style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">${m.title}</p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
        This motion was moved but received no second within 48 hours and has been marked
        <strong>Died — No Second</strong>. No further action is required.
      </p>
      ${btn(url, 'View motion')}
    `);
    await sendEmail(emails, `[HFC Board] Motion died — no second: ${m.title}`, html);
  }

  return ids;
}

// ─── Job 3: auto_close_vote ──────────────────────────────────────────────────
// Motions in 'voting' status after 48 hours → auto-abstain remaining voters,
// tally, determine result (majority aye = passed, otherwise failed).

async function jobAutoCloseVote(): Promise<string[]> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: motions, error } = await admin
    .from('motions')
    .select('id, motion_number, title, motion_text_hash')
    .eq('status', 'voting')
    .lt('voting_opened_at', cutoff);

  if (error) {
    console.error('[cron:auto_close_vote] query error:', error);
    return [];
  }
  if (!motions || motions.length === 0) return [];

  const { data: voters } = await admin
    .from('members')
    .select('id, email')
    .eq('is_active', true)
    .eq('role', 'member');

  const { data: allMembers } = await admin.from('members').select('email').eq('is_active', true);
  const allEmails = (allMembers ?? []).map((m) => m.email);

  const closedIds: string[] = [];

  for (const motion of motions) {
    const { data: existingVotes } = await admin
      .from('votes')
      .select('member_id, vote')
      .eq('motion_id', motion.id);

    const votedIds = new Set((existingVotes ?? []).map((v) => v.member_id));
    const nonVoters = (voters ?? []).filter((m) => !votedIds.has(m.id));
    const now = new Date().toISOString();

    // Auto-abstain non-voters
    if (nonVoters.length > 0) {
      await admin.from('votes').insert(
        nonVoters.map((m) => ({
          motion_id: motion.id,
          member_id: m.id,
          vote: 'abstain',
          motion_hash_at_vote: motion.motion_text_hash ?? '',
          cast_at: now,
        })),
      );
    }

    // Tally all votes
    const { data: finalVotes } = await admin
      .from('votes')
      .select('vote')
      .eq('motion_id', motion.id);

    const tally = { aye: 0, nay: 0, abstain: 0, defer: 0 };
    for (const v of finalVotes ?? []) {
      if (v.vote === 'aye') tally.aye++;
      else if (v.vote === 'nay') tally.nay++;
      else if (v.vote === 'abstain') tally.abstain++;
      else if (v.vote === 'defer') tally.defer++;
    }

    // Simple majority of aye vs nay determines result (abstains/defers are neutral)
    const result = tally.aye > tally.nay ? 'passed' : 'failed';
    const status = `decided_${result}` as 'decided_passed' | 'decided_failed';

    const { error: updateError } = await admin
      .from('motions')
      .update({ status, result, decided_at: now })
      .eq('id', motion.id)
      .eq('status', 'voting');

    if (updateError) {
      console.error(`[cron:auto_close_vote] update error for ${motion.id}:`, updateError);
      continue;
    }

    await admin.from('audit_log').insert({
      motion_id: motion.id,
      member_id: null,
      event_type: 'voting_closed',
      event_data: {
        motion_number: motion.motion_number,
        result,
        auto_abstained: nonVoters.length,
        tally,
        reason: 'auto: 48h voting timeout',
      },
      ip_address: null,
      user_agent: 'cron',
    });

    void notifyVotingClosed(
      allEmails,
      motion.id,
      motion.motion_number,
      motion.title,
      result,
      tally,
    );

    closedIds.push(motion.id);
  }

  return closedIds;
}

// ─── Job 4: vote_reminder ────────────────────────────────────────────────────
// Motions in 'voting' status that opened between 23 h and 25 h ago →
// send a one-time reminder to members who haven't voted yet.

async function jobVoteReminder(): Promise<number> {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

  const { data: motions, error } = await admin
    .from('motions')
    .select('id, motion_number, title')
    .eq('status', 'voting')
    .gte('voting_opened_at', windowStart)
    .lte('voting_opened_at', windowEnd);

  if (error) {
    console.error('[cron:vote_reminder] query error:', error);
    return 0;
  }
  if (!motions || motions.length === 0) return 0;

  const { data: voters } = await admin
    .from('members')
    .select('id, email')
    .eq('is_active', true)
    .eq('role', 'member');

  let sent = 0;

  for (const motion of motions) {
    const { data: existingVotes } = await admin
      .from('votes')
      .select('member_id')
      .eq('motion_id', motion.id);

    const votedIds = new Set((existingVotes ?? []).map((v) => v.member_id));
    const pendingVoters = (voters ?? []).filter((m) => !votedIds.has(m.id));

    if (pendingVoters.length === 0) continue;

    const pendingEmails = pendingVoters.map((m) => m.email);
    const url = `${APP_URL}/motions/${motion.id}`;

    const html = shell(`
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">${motion.motion_number}</p>
      <p style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">${motion.title}</p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
        <strong>Reminder:</strong> Voting on this motion closes in approximately 24 hours.
        If you do not cast your vote, you will be automatically recorded as <strong>Abstain</strong>.
      </p>
      ${btn(url, 'Cast your vote')}
    `);

    await sendEmail(
      pendingEmails,
      `[HFC Board] Reminder: vote closes in ~24 hours — ${motion.title}`,
      html,
    );
    sent += pendingEmails.length;
  }

  return sent;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron] background-jobs started at', new Date().toISOString());

  const [diedNoMotion, diedNoSecond, autoClosed, reminders] = await Promise.all([
    jobDiedNoMotion(),
    jobDiedNoSecond(),
    jobAutoCloseVote(),
    jobVoteReminder(),
  ]);

  const summary = {
    died_no_motion: diedNoMotion.length,
    died_no_second: diedNoSecond.length,
    auto_closed_vote: autoClosed.length,
    vote_reminders_sent: reminders,
  };

  console.log('[cron] background-jobs complete:', summary);
  return NextResponse.json({ ok: true, ...summary });
}

// Allow GET for easy health checks / manual triggers (still requires secret)
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
