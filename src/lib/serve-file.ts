import 'server-only';
import { ALLOWED_MIME } from '@/lib/attachments';

/**
 * A stored document as an HTTP response. Files are private: never cached by
 * the CDN or a shared proxy. Anything not on the accepted list is downloaded
 * rather than shown, and a sandbox policy stops a file running script.
 */
export function fileResponse(
  data: ArrayBuffer,
  contentType: string,
  fileName: string,
  disposition: 'inline' | 'attachment',
): Response {
  const safeType = ALLOWED_MIME.has(contentType) ? contentType : 'application/octet-stream';
  const mode = safeType === 'application/octet-stream' ? 'attachment' : disposition;
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(data, {
    headers: {
      'Content-Type': safeType,
      'Content-Length': String(data.byteLength),
      'Content-Disposition': `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy':
        "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
