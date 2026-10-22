/**
 * Netlify scheduled function — runs every 15 minutes.
 * Calls the Next.js background-jobs route, authenticated by CRON_SECRET.
 *
 * Netlify's current runtime requires a Response (an old-style
 * { statusCode, body } object makes every run fail with a 502). A run that
 * does not get a JSON { ok: true } back is reported as a failure, so problems
 * show up in Netlify's function logs instead of passing silently.
 */

import type { Config } from '@netlify/functions';

export default async function handler(): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  if (!secret) {
    console.error('[cron] CRON_SECRET not set — aborting');
    return new Response('CRON_SECRET not configured', { status: 500 });
  }

  const url = `${appUrl}/api/cron/background-jobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'manual',
  });
  const body = await res.text();

  let ok = false;
  try {
    ok = res.ok && JSON.parse(body).ok === true;
  } catch {
    ok = false;
  }

  if (!ok) {
    console.error('[cron] background jobs failed:', res.status, body.slice(0, 500));
    return new Response(`Background jobs failed (${res.status})`, { status: 502 });
  }

  console.log('[cron] background jobs:', body);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

export const config: Config = {
  schedule: '*/15 * * * *',
};
