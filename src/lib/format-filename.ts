/** A Content-Disposition header that keeps the file's name, accents and all. */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
