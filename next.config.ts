import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow up to ~110MB per submission (4 attachments × 25MB + form overhead)
      bodySizeLimit: '110mb',
    },
  },
};

export default nextConfig;
