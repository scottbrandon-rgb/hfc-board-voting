import 'server-only';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? 'board@harrisonfaith.org';
const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Gracefully skip sending when no API key is configured (local dev)
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function send(to: string[], subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log(`[email] No RESEND_API_KEY — would have sent "${subject}" to ${to.join(', ')}`);
    return;
  }
  if (to.length === 0) return;

  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Log but don't throw — email failure should never break the action
    console.error('[email] Send failed:', err);
  }
}

// ─── Shared template shell ────────────────────────────────────────────────────

function shell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#0a0a0a;padding:20px 28px;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Harrison Faith Church</p>
            <p style="margin:4px 0 0;color:#a3a3a3;font-size:11px;">Board Voting Platform</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 28px 20px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px 24px;border-top:1px solid #f0f0f0;">
            <p style="margin:0;color:#a3a3a3;font-size:11px;line-height:1.6;">
              All electronic votes are provisional and non-binding. Final adoption requires ratification
              by the Board of Directors at the next regular in-person session.
            </p>
            <p style="margin:8px 0 0;color:#a3a3a3;font-size:11px;">
              <a href="${APP_URL}" style="color:#a3a3a3;">Board Voting Platform</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">${label}</a>`;
}

function motionMeta(motionNumber: string, title: string): string {
  return `<p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">${motionNumber}</p>
          <p style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">${title}</p>`;
}

// ─── Notification helpers ─────────────────────────────────────────────────────

export async function notifyMotionPublished(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell(`
    ${motionMeta(motionNumber, title)}
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
      A new motion has been published and is open for consideration by the board.
      Any board member may formally move this motion.
    </p>
    ${btn(url, 'View motion')}
  `);
  await send(to, `[HFC Board] New motion: ${title}`, html);
}

export async function notifyVotingOpened(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell(`
    ${motionMeta(motionNumber, title)}
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
      Electronic voting is now open for this motion. Please cast your vote at your earliest
      convenience. Votes of <strong>Aye</strong>, <strong>Nay</strong>, <strong>Abstain</strong>,
      or <strong>Defer to in-person</strong> are available.
    </p>
    ${btn(url, 'Cast your vote')}
  `);
  await send(to, `[HFC Board] Vote now open: ${title}`, html);
}

export async function notifyVotingClosed(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
  result: string,
  tally: { aye: number; nay: number; abstain: number; defer: number },
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const resultLabel =
    result === 'passed'
      ? 'Passed (provisional)'
      : result === 'failed'
        ? 'Failed (provisional)'
        : 'Deferred to in-person';

  const html = shell(`
    ${motionMeta(motionNumber, title)}
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Electronic voting has closed. The provisional result is:
    </p>
    <p style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:700;">${resultLabel}</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 12px;background:#f0fdf4;border-radius:6px;text-align:center;width:25%;">
          <p style="margin:0;color:#15803d;font-size:20px;font-weight:700;">${tally.aye}</p>
          <p style="margin:2px 0 0;color:#15803d;font-size:11px;">Aye</p>
        </td>
        <td width="8"></td>
        <td style="padding:10px 12px;background:#fef2f2;border-radius:6px;text-align:center;width:25%;">
          <p style="margin:0;color:#dc2626;font-size:20px;font-weight:700;">${tally.nay}</p>
          <p style="margin:2px 0 0;color:#dc2626;font-size:11px;">Nay</p>
        </td>
        <td width="8"></td>
        <td style="padding:10px 12px;background:#f5f5f4;border-radius:6px;text-align:center;width:25%;">
          <p style="margin:0;color:#525252;font-size:20px;font-weight:700;">${tally.abstain}</p>
          <p style="margin:2px 0 0;color:#525252;font-size:11px;">Abstain</p>
        </td>
        <td width="8"></td>
        <td style="padding:10px 12px;background:#faf5ff;border-radius:6px;text-align:center;width:25%;">
          <p style="margin:0;color:#7c3aed;font-size:20px;font-weight:700;">${tally.defer}</p>
          <p style="margin:2px 0 0;color:#7c3aed;font-size:11px;">Defer</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
      This result is provisional pending ratification at the next in-person board meeting.
    </p>
    ${btn(url, 'View results')}
  `);
  await send(to, `[HFC Board] Vote result: ${resultLabel} — ${title}`, html);
}

export async function notifyMotionRatified(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
  ratifiedBy: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell(`
    ${motionMeta(motionNumber, title)}
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
      This motion has been formally ratified by ${ratifiedBy} at an in-person board meeting
      and is now officially adopted.
    </p>
    ${btn(url, 'View motion')}
  `);
  await send(to, `[HFC Board] Ratified: ${title}`, html);
}

export async function notifyVoteReminder(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell(`
    ${motionMeta(motionNumber, title)}
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
      <strong>Reminder:</strong> You have not yet cast your vote on this motion.
      If you do not vote before the deadline, you will be automatically recorded as <strong>Abstain</strong>.
    </p>
    ${btn(url, 'Cast your vote')}
  `);
  await send(to, `[HFC Board] Reminder: your vote is needed — ${title}`, html);
}
