import type { MetadataRoute } from 'next';

// Lets members add the board site to their home screen as an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HFC Deacon Board',
    short_name: 'HFC Board',
    description: 'Motions, votes and meetings for the Harrison Faith Church Deacon Board.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f5f7',
    theme_color: '#1f4fbf',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
