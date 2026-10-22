import 'server-only';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? 'board@harrisonfaith.org';
export const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface Message {
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends one email per recipient (nobody sees anyone else's address, and one
 * bad address cannot sink the rest). Resend reports failures by returning an
 * error rather than throwing, so both paths are logged.
 */
export async function sendEach(recipients: readonly string[], message: Message): Promise<void> {
  const to = [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) return;
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — would send "${message.subject}" to ${to.length}`);
    return;
  }

  for (let i = 0; i < to.length; i += 100) {
    const chunk = to.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(
        chunk.map((address) => ({
          from: FROM,
          to: [address],
          subject: message.subject,
          html: message.html,
          text: message.text,
        })),
      );
      if (error) console.error(`[email] "${message.subject}" failed:`, error);
    } catch (err) {
      console.error(`[email] "${message.subject}" failed:`, err);
    }
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface TemplateInput {
  /** Short line above the title, e.g. the motion number. */
  eyebrow?: string;
  title: string;
  /** Plain-text paragraphs; escaped before use. */
  paragraphs: string[];
  /** Optional quoted note (a member's or the chair's words). */
  quote?: { text: string; by?: string };
  button?: { href: string; label: string };
}

export function render({
  eyebrow,
  title,
  paragraphs,
  quote,
  button,
}: TemplateInput): Omit<Message, 'subject'> {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;color:#3f454c;font-size:16px;line-height:24px;">${escapeHtml(t)}</p>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e1e4e8;border-radius:16px;">
<tr><td style="padding:22px 24px 0;">
<p style="margin:0;color:#1f4fbf;font-size:14px;font-weight:700;">Harrison Faith · Deacon Board</p>
</td></tr>
<tr><td style="padding:16px 24px 8px;">
${eyebrow ? `<p style="margin:0 0 4px;color:#5b6168;font-size:14px;">${escapeHtml(eyebrow)}</p>` : ''}
<h1 style="margin:0 0 16px;color:#16191d;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(title)}</h1>
${paragraphs.map(p).join('\n')}
${
  quote
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#f4f5f7;border-radius:10px;color:#3f454c;font-size:16px;line-height:24px;">“${escapeHtml(quote.text)}”${quote.by ? `<br><span style="font-size:14px;color:#5b6168;">— ${escapeHtml(quote.by)}</span>` : ''}</div>`
    : ''
}
${
  button
    ? `<a href="${escapeHtml(button.href)}" style="display:inline-block;margin:4px 0 8px;background:#1f4fbf;color:#ffffff;text-decoration:none;font-size:17px;font-weight:600;padding:14px 26px;border-radius:12px;">${escapeHtml(button.label)}</a>`
    : ''
}
</td></tr>
<tr><td style="padding:16px 24px 22px;border-top:1px solid #e1e4e8;">
<p style="margin:0;color:#5b6168;font-size:14px;line-height:20px;">Online approvals are provisional until ratified at the next in-person meeting. Change which emails you get under Profile on the board site.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    'Harrison Faith · Deacon Board',
    '',
    eyebrow ?? '',
    title,
    '',
    ...paragraphs.flatMap((t) => [t, '']),
    ...(quote ? [`"${quote.text}"${quote.by ? ` — ${quote.by}` : ''}`, ''] : []),
    ...(button ? [`${button.label}: ${button.href}`, ''] : []),
    'Online approvals are provisional until ratified at the next in-person meeting.',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');

  return { html, text };
}

export function motionUrl(motionId: string): string {
  return `${APP_URL}/motions/${motionId}`;
}
