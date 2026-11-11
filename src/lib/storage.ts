import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

/**
 * Private file storage: motion documents and the official PDF records.
 *
 * On Netlify this is Netlify Blobs. Blobs have no public address: the only way
 * to read one is through this app, which checks the member's sign-in first
 * (see src/app/files). For local development without Netlify, set
 * LOCAL_STORAGE_DIR and files are kept in that folder instead.
 *
 * Deploy previews and branch deploys use their own stores, so testing a
 * preview never overwrites production documents. (DEPLOY_CONTEXT is fixed at
 * build time from Netlify's CONTEXT; see next.config.ts.)
 */

export type Bucket = 'motion-attachments' | 'motion-pdfs';

export interface StoredFile {
  data: ArrayBuffer;
  contentType: string;
}

interface Backend {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export function storeName(bucket: Bucket): string {
  const context = process.env.DEPLOY_CONTEXT;
  return !context || context === 'production' ? bucket : `${context}--${bucket}`;
}

function blobs(bucket: Bucket): Backend {
  // Strong consistency: a document is read back moments after it is written.
  const store = getStore({ name: storeName(bucket), consistency: 'strong' });
  return {
    async put(key, data, contentType) {
      await store.set(key, data, { metadata: { contentType } });
    },
    async get(key) {
      const found = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!found) return null;
      const contentType = found.metadata?.contentType;
      return {
        data: found.data,
        contentType: typeof contentType === 'string' ? contentType : 'application/octet-stream',
      };
    },
    async exists(key) {
      return (await store.getMetadata(key)) !== null;
    },
    async remove(key) {
      await store.delete(key);
    },
  };
}

function folder(root: string, bucket: Bucket): Backend {
  const dir = path.resolve(root, storeName(bucket));
  const file = (key: string) => path.join(dir, encodeURIComponent(key));
  return {
    async put(key, data, contentType) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(key), Buffer.from(data));
      await writeFile(`${file(key)}.type`, contentType);
    },
    async get(key) {
      try {
        const data = await readFile(file(key));
        const contentType = await readFile(`${file(key)}.type`, 'utf8').catch(
          () => 'application/octet-stream',
        );
        return {
          data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          contentType,
        };
      } catch {
        return null;
      }
    },
    async exists(key) {
      return (await this.get(key)) !== null;
    },
    async remove(key) {
      await rm(file(key), { force: true });
      await rm(`${file(key)}.type`, { force: true });
    },
  };
}

function backend(bucket: Bucket): Backend {
  const local = process.env.LOCAL_STORAGE_DIR;
  return local ? folder(local, bucket) : blobs(bucket);
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export async function putFile(
  bucket: Bucket,
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await backend(bucket).put(key, toArrayBuffer(data), contentType);
}

export function getFile(bucket: Bucket, key: string): Promise<StoredFile | null> {
  return backend(bucket).get(key);
}

export function fileExists(bucket: Bucket, key: string): Promise<boolean> {
  return backend(bucket).exists(key);
}

/** Removes files; a file that is already gone is not an error. */
export async function removeFiles(bucket: Bucket, keys: readonly string[]): Promise<void> {
  const b = backend(bucket);
  await Promise.all(
    keys.map((k) => b.remove(k).catch((err) => console.error('[storage] remove failed:', k, err))),
  );
}

// ─── Chunked uploads ─────────────────────────────────────────────────────────
// Netlify functions accept requests up to 6 MB, so the browser sends a
// document in 4 MB pieces. Each piece is kept under a temporary key until the
// server joins them, fingerprints the result and stores it at its real key.

export function partKey(key: string, index: number): string {
  return `_uploads/${key}/${String(index).padStart(4, '0')}`;
}

export async function joinParts(
  bucket: Bucket,
  key: string,
  parts: number,
  maxBytes: number,
): Promise<{ data: Uint8Array; contentType: string } | { error: 'missing' | 'too_big' }> {
  const b = backend(bucket);
  const pieces: Uint8Array[] = [];
  let total = 0;
  let contentType = 'application/octet-stream';
  for (let i = 0; i < parts; i++) {
    const piece = await b.get(partKey(key, i));
    if (!piece) return { error: 'missing' };
    total += piece.data.byteLength;
    if (total > maxBytes) return { error: 'too_big' };
    pieces.push(new Uint8Array(piece.data));
    contentType = piece.contentType;
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const p of pieces) {
    data.set(p, offset);
    offset += p.byteLength;
  }
  return { data, contentType };
}

export async function removeParts(bucket: Bucket, key: string, parts: number): Promise<void> {
  await removeFiles(
    bucket,
    Array.from({ length: parts }, (_, i) => partKey(key, i)),
  );
}
