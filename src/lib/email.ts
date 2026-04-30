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

function shell({
  headline,
  body,
  cta,
  fallbackUrl,
  fallbackLabel,
  expiry,
}: {
  headline: string;
  body: string;
  cta?: string; // full <a> tag
  fallbackUrl?: string;
  fallbackLabel?: string;
  expiry?: string;
}): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Logo / Wordmark -->
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#0a0a0a;border-radius:10px;padding:8px 14px;">
                  <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">HFC</span>
                </td>
                <td style="padding-left:10px;">
                  <span style="color:#3f3f46;font-size:13px;font-weight:600;">Harrison Faith Church</span><br>
                  <span style="color:#a1a1aa;font-size:11px;">Board Voting Platform</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">

            <!-- Card body -->
            <td style="padding:40px 40px 32px;text-align:center;">

              <!-- Headline -->
              <h1 style="margin:0 0 16px;color:#09090b;font-size:24px;font-weight:700;line-height:1.3;">${headline}</h1>

              <!-- Body copy -->
              <div style="margin:0 0 28px;color:#52525b;font-size:15px;line-height:1.7;text-align:left;">
                ${body}
              </div>

              <!-- CTA button -->
              ${cta ? cta : ''}

              <!-- Fallback link -->
              ${
                fallbackUrl
                  ? `<p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;">
                  If the button doesn't work, <a href="${fallbackUrl}" style="color:#3f3f46;text-decoration:underline;">${fallbackLabel ?? 'click here'}</a>.
                </p>`
                  : ''
              }

              <!-- Expiry -->
              ${
                expiry
                  ? `<p style="margin:12px 0 0;color:#a1a1aa;font-size:12px;">${expiry}</p>`
                  : ''
              }

            </td>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 8px;text-align:center;">
            <p style="margin:0 0 6px;color:#a1a1aa;font-size:11px;line-height:1.6;max-width:400px;margin-left:auto;margin-right:auto;">
              All electronic votes are provisional and non-binding. Final adoption requires ratification
              by the Board of Directors at the next regular in-person session.
            </p>
            <p style="margin:0;color:#d4d4d8;font-size:11px;">
              &copy; ${year} Harrison Faith Church &middot;
              <a href="${APP_URL}" style="color:#d4d4d8;text-decoration:none;">Board Voting Platform</a>
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
  return `<a href="${href}" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 24px;border-radius:8px;text-align:center;">${label}</a>`;
}

function motionHeader(motionNumber: string, title: string): string {
  return `<p style="margin:0 0 4px;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">${motionNumber}</p>
          <p style="margin:0 0 20px;color:#09090b;font-size:18px;font-weight:700;line-height:1.3;text-align:center;">${title}</p>`;
}

// ─── Motion published ─────────────────────────────────────────────────────────

export async function notifyMotionPublished(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell({
    headline: 'New Motion Published',
    body: `
      ${motionHeader(motionNumber, title)}
      <p style="margin:0;color:#52525b;font-size:15px;">
        A new motion has been published and is open for consideration. Any board member may
        formally move this motion.
      </p>
    `,
    cta: btn(url, 'View Motion'),
    fallbackUrl: url,
    fallbackLabel: 'open in browser',
  });
  await send(to, `[HFC Board] New motion: ${title}`, html);
}

// ─── Voting opened ────────────────────────────────────────────────────────────

export async function notifyVotingOpened(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell({
    headline: 'Your Vote is Needed',
    body: `
      ${motionHeader(motionNumber, title)}
      <p style="margin:0;color:#52525b;font-size:15px;">
        Electronic voting is now open. Please cast your vote at your earliest convenience —
        <strong>Aye</strong>, <strong>Nay</strong>, <strong>Abstain</strong>,
        or <strong>Defer to in-person</strong>.
      </p>
    `,
    cta: btn(url, 'Cast Your Vote'),
    fallbackUrl: url,
    fallbackLabel: 'open in browser',
  });
  await send(to, `[HFC Board] Vote now open: ${title}`, html);
}

// ─── Voting closed ────────────────────────────────────────────────────────────

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

  const resultColor =
    result === 'passed' ? '#16a34a' : result === 'failed' ? '#dc2626' : '#7c3aed';

  const tallyTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:separate;border-spacing:6px;">
      <tr>
        <td style="background:#f0fdf4;border-radius:8px;padding:12px 8px;text-align:center;">
          <div style="color:#15803d;font-size:22px;font-weight:700;">${tally.aye}</div>
          <div style="color:#15803d;font-size:11px;margin-top:2px;">Aye</div>
        </td>
        <td style="background:#fef2f2;border-radius:8px;padding:12px 8px;text-align:center;">
          <div style="color:#dc2626;font-size:22px;font-weight:700;">${tally.nay}</div>
          <div style="color:#dc2626;font-size:11px;margin-top:2px;">Nay</div>
        </td>
        <td style="background:#f4f4f5;border-radius:8px;padding:12px 8px;text-align:center;">
          <div style="color:#52525b;font-size:22px;font-weight:700;">${tally.abstain}</div>
          <div style="color:#52525b;font-size:11px;margin-top:2px;">Abstain</div>
        </td>
        <td style="background:#faf5ff;border-radius:8px;padding:12px 8px;text-align:center;">
          <div style="color:#7c3aed;font-size:22px;font-weight:700;">${tally.defer}</div>
          <div style="color:#7c3aed;font-size:11px;margin-top:2px;">Defer</div>
        </td>
      </tr>
    </table>`;

  const html = shell({
    headline: 'Voting Has Closed',
    body: `
      ${motionHeader(motionNumber, title)}
      <p style="margin:0 0 8px;color:#52525b;font-size:15px;">The provisional result is:</p>
      <p style="margin:0;color:${resultColor};font-size:20px;font-weight:700;text-align:center;">${resultLabel}</p>
      ${tallyTable}
      <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">
        Provisional — pending ratification at the next in-person board meeting.
      </p>
    `,
    cta: btn(url, 'View Results'),
    fallbackUrl: url,
    fallbackLabel: 'open in browser',
  });
  await send(to, `[HFC Board] Result: ${resultLabel} — ${title}`, html);
}

// ─── Vote reminder (SMS fallback email) ──────────────────────────────────────

export async function notifyVoteReminder(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell({
    headline: 'Friendly Reminder: Your Vote',
    body: `
      ${motionHeader(motionNumber, title)}
      <p style="margin:0;color:#52525b;font-size:15px;">
        Voting is still open on this motion and your vote hasn't been recorded yet.
        Please take a moment to cast your vote.
      </p>
    `,
    cta: btn(url, 'Cast Your Vote Now'),
    fallbackUrl: url,
    fallbackLabel: 'open in browser',
  });
  await send(to, `[HFC Board] Reminder: vote needed on "${title}"`, html);
}

// ─── Motion ratified ──────────────────────────────────────────────────────────

export async function notifyMotionRatified(
  to: string[],
  motionId: string,
  motionNumber: string,
  title: string,
  ratifiedBy: string,
): Promise<void> {
  const url = `${APP_URL}/motions/${motionId}`;
  const html = shell({
    headline: 'Motion Ratified',
    body: `
      ${motionHeader(motionNumber, title)}
      <p style="margin:0;color:#52525b;font-size:15px;">
        This motion has been formally ratified by <strong style="color:#09090b;">${ratifiedBy}</strong>
        at an in-person board meeting and is now officially adopted.
      </p>
    `,
    cta: btn(url, 'View Motion'),
    fallbackUrl: url,
    fallbackLabel: 'open in browser',
  });
  await send(to, `[HFC Board] Ratified: ${title}`, html);
}
