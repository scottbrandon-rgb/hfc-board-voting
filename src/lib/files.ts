import 'server-only';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

/**
 * Stored files: motion documents and the official PDF records. On Netlify
 * they live in Netlify Blobs (Data & Storage → Blobs), in two stores:
 *
 *   motion-attachments   key = motion_attachments.storage_path
 *   motion-pdfs          key = "<motion id>.pdf"
 *
 * Files are private. Members reach them only through the app's download
 * routes (src/app/api/files), which check who is signed in.
 *
 * For local development and tests, set HFC_LOCAL_FILES to a folder and files
 * are kept there instead.
 */

export type Bucket = 'motion-attachments' | 'motion-pdfs';

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
}

const LOCAL_DIR = process.env.HFC_LOCAL_FILES;

function localPath(bucket: Bucket, key: string): string {
  const root = path.resolve(LOCAL_DIR!, bucket);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Bad file key');
  return full;
}

function store(bucket: Bucket) {
  return getStore({ name: bucket, consistency: 'strong' });
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export async function putFile(
  bucket: Bucket,
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  if (LOCAL_DIR) {
    const file = localPath(bucket, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.type`, contentType);
    return;
  }
  await store(bucket).set(key, toArrayBuffer(data), { metadata: { contentType } });
}

export async function readFileBytes(bucket: Bucket, key: string): Promise<Uint8Array | null> {
  if (LOCAL_DIR) {
    try {
      return new Uint8Array(await readFile(localPath(bucket, key)));
    } catch {
      return null;
    }
  }
  const data = await store(bucket).get(key, { type: 'arrayBuffer' });
  return data ? new Uint8Array(data) : null;
}

export async function openFile(bucket: Bucket, key: string): Promise<StoredFile | null> {
  if (LOCAL_DIR) {
    const bytes = await readFileBytes(bucket, key);
    if (!bytes) return null;
    const contentType = await readFile(`${localPath(bucket, key)}.type`, 'utf8').catch(() => null);
    return { body: new Blob([toArrayBuffer(bytes)]).stream(), contentType };
  }
  const result = await store(bucket).getWithMetadata(key, { type: 'stream' });
  if (!result) return null;
  const type = result.metadata?.contentType;
  return { body: result.data, contentType: typeof type === 'string' ? type : null };
}

export async function fileExists(bucket: Bucket, key: string): Promise<boolean> {
  if (LOCAL_DIR) {
    return stat(localPath(bucket, key))
      .then(() => true)
      .catch(() => false);
  }
  return (await store(bucket).getMetadata(key)) !== null;
}

export async function deleteFile(bucket: Bucket, key: string): Promise<void> {
  if (LOCAL_DIR) {
    await rm(localPath(bucket, key), { force: true });
    await rm(`${localPath(bucket, key)}.type`, { force: true });
    return;
  }
  await store(bucket).delete(key);
}
