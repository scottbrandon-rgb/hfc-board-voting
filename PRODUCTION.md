# Production Checklist — HFC Board Voting Platform

Everything here requires a human to complete in an external dashboard.
Code changes are tracked in git; these are one-time platform configurations.

---

## Supabase

### ✅ Already done
- RLS enabled on all tables
- Both storage buckets private (`motion-attachments`, `motion-pdfs`)
- Migrations applied through `011_rls_hardening.sql`
- Magic link / OTP auth enabled

### 🔲 Enable Point-in-Time Recovery (PITR)
Supabase Free/Pro includes daily backups. PITR requires Pro plan.
Dashboard → Project → Settings → Database → Backups → Enable PITR

### 🔲 Configure Auth rate limits
Dashboard → Project → Auth → Rate Limits
Recommended settings:
- OTP expiry: 3600 seconds (1 hour) ← already set by default
- Email rate limit: 5 per hour per IP (default)
- No changes required unless abuse is observed

### 🔲 Add redirect URL to Supabase Auth allowlist
Dashboard → Project → Auth → URL Configuration
Add: `https://board.harrisonfaith.church/auth/callback`
Verify `Site URL` is set to: `https://board.harrisonfaith.church`

---

## Resend

### 🔲 Verify sending domain
Resend requires DNS verification before sending from `board@harrisonfaith.org`.

1. Log in to resend.com → Domains → Add Domain → `harrisonfaith.org`
2. Add the provided DNS records (DKIM, SPF, DMARC) to your DNS provider
3. Wait for verification (usually < 5 minutes)
4. Confirm `RESEND_FROM_EMAIL=board@harrisonfaith.org` is set on Netlify

Until the domain is verified, Resend will reject sends from that address.
Temporary workaround: set `RESEND_FROM_EMAIL=onboarding@resend.dev` (Resend's default sender).

---

## Netlify

### ✅ Already done
- GitHub repo connected, auto-deploy on push to `main`
- Custom domain `board.harrisonfaith.church` configured
- All required env vars set (verify at: Netlify → Site → Environment Variables):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `APP_URL`
  - `NEXT_PUBLIC_APP_URL`
  - `CRON_SECRET`

### 🔲 Enable branch deploy protection (optional)
Netlify → Site → Site Configuration → Visitor Access
Set password or SSO for non-production branch deploys so preview URLs
are not accessible without authentication.

---

## DNS / Domain

### 🔲 Verify HTTPS certificate
Netlify auto-provisions Let's Encrypt. Confirm:
- `https://board.harrisonfaith.church` loads with a valid cert
- HTTP redirects to HTTPS (Netlify handles this by default)

---

## Health Check

After every deploy, verify the platform is healthy:

```
curl https://board.harrisonfaith.church/api/health
```

Expected response (HTTP 200):
```json
{
  "ok": true,
  "checks": {
    "NEXT_PUBLIC_SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true,
    ...
    "db": "ok (N active members)",
    "storage_attachments": "ok (private)",
    "storage_pdfs": "ok (private)"
  }
}
```

---

## Go-Live Checklist

- [ ] Supabase Auth redirect URL allowlist updated
- [ ] Resend domain DNS records added and verified
- [ ] All Netlify env vars confirmed present (run `/api/health`)
- [ ] Test full magic link flow end-to-end in production browser
- [ ] Create at least one test motion through full lifecycle (draft → ratified)
- [ ] Confirm PDF download works for chair and secretary
- [ ] Confirm background jobs cron is active (Netlify → Functions → Scheduled)
- [ ] Add all board members to the Members table
