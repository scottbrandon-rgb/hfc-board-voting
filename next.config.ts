import type { NextConfig } from 'next';

const APP_URL = process.env.APP_URL ?? 'https://board.harrisonfaith.church';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      // Allow up to ~110MB per submission (4 attachments × 25MB + form overhead)
      bodySizeLimit: '110mb',
    },
  },

  // ── Security headers ──────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Force HTTPS for 1 year, include subdomains
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // No referrer to external sites
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Minimal permissions policy
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              `default-src 'self'`,
              // Next.js inline scripts + Supabase auth
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
              // Tailwind inline styles
              `style-src 'self' 'unsafe-inline'`,
              // Images: self + Supabase storage
              `img-src 'self' data: blob: ${SUPABASE_URL}`,
              // Fonts: self only
              `font-src 'self'`,
              // API calls: self + Supabase
              `connect-src 'self' ${SUPABASE_URL} wss://*.supabase.co`,
              // PDF blobs opened in new tab
              `frame-src 'self' blob:`,
              `object-src 'none'`,
              `base-uri 'self'`,
              `form-action 'self'`,
              `frame-ancestors 'none'`,
              `upgrade-insecure-requests`,
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
