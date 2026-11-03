import type { NextConfig } from 'next';

const APP_URL = process.env.APP_URL ?? 'https://board.harrisonfaith.church';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'pg'],
  experimental: {
    serverActions: {
      // Documents upload in pieces through /api/uploads, so form submissions
      // are small. A low limit keeps oversized requests out.
      bodySizeLimit: '2mb',
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
              // Next.js inline scripts
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
              // Tailwind inline styles
              `style-src 'self' 'unsafe-inline'`,
              `img-src 'self' data: blob:`,
              // Fonts: self only
              `font-src 'self'`,
              `connect-src 'self'`,
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
