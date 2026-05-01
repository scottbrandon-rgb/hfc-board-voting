/**
 * Netlify scheduled function — runs every 15 minutes.
 * Calls the Next.js background-jobs API route, authenticated by CRON_SECRET.
 */

import type { Config } from '@netlify/functions';

export default async function handler() {
  const secret = process.env.CRON_SECRET;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  if (!secret) {
    console.error('[cron] CRON_SECRET not set — aborting');
    return { statusCode: 500, body: 'CRON_SECRET not configured' };
  }

  const url = `${appUrl}/api/cron/background-jobs`;
  console.log('[cron] calling', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.text();
  console.log('[cron] response', res.status, body);

  return { statusCode: res.status, body };
}

export const config: Config = {
  schedule: '*/15 * * * *',
};
