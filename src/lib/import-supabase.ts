import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { query, transaction, type Executor, type Row } from '@/lib/db';
import { fileExists, putFile, type Bucket } from '@/lib/storage';
import { PDF_STATUSES } from '@/lib/generate-pdf';

/**
 * ONE-TIME MOVE from Supabase to Netlify. Remove this file, the
 * /api/migrate/supabase route and the @supabase/supabase-js package once the
 * board is running on Netlify (MIGRATION.md, last step).
 *
 * Reads with the Supabase service-role key (still set on Netlify as
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) and writes to
 * Netlify Database and Netlify Blobs. Supabase is only read, never changed.
 */

// Parents before children, so every foreign key finds its row.
const TABLES = [
  { name: 'members', order: 'id' },
  { name: 'motions', order: 'id' },
  { name: 'motion_electorate', order: 'motion_id' },
  { name: 'votes', order: 'id' },
  { name: 'comments', order: 'id' },
  { name: 'motion_attachments', order: 'id' },
  { name: 'audit_log', order: 'id' },
  { name: 'board_settings', order: 'id' },
] as const;

type TableName = (typeof TABLES)[number]['name'];
const IDENT = /^[a-z_][a-z0-9_]*$/;

export function supabaseSource(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readTable(source: SupabaseClient, table: TableName, order: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await source
      .from(table)
      .select('*')
      .order(order)
      .range(from, from + 999);
    if (error) throw new Error(`Reading ${table} from Supabase failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function targetColumns(tx: Executor): Promise<Map<string, Map<string, string>>> {
  const cols = await tx.query<{ table_name: string; column_name: string; data_type: string }>(
    `select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public'`,
  );
  const map = new Map<string, Map<string, string>>();
  for (const c of cols) {
    if (!map.has(c.table_name)) map.set(c.table_name, new Map());
    map.get(c.table_name)!.set(c.column_name, c.data_type);
  }
  return map;
}

async function insertRows(
  tx: Executor,
  table: TableName,
  rows: Row[],
  columns: Map<string, string>,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const sourceCols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cols = sourceCols.filter((c) => columns.has(c) && IDENT.test(c));
  const dropped = sourceCols.filter((c) => !cols.includes(c)).map((c) => `${table}.${c}`);

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const slots = cols.map((c) => {
        let v = row[c] ?? null;
        if (v !== null && (columns.get(c) === 'jsonb' || columns.get(c) === 'json')) {
          v = JSON.stringify(v);
        }
        values.push(v);
        return `$${values.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    await tx.query(
      `insert into public.${table} (${cols.map((c) => `"${c}"`).join(', ')}) values ${tuples.join(', ')}`,
      values,
    );
  }
  return dropped;
}

export interface Counts {
  [table: string]: number;
}

export async function countSource(source: SupabaseClient): Promise<Counts> {
  const counts: Counts = {};
  for (const { name } of TABLES) {
    const { count, error } = await source.from(name).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Counting ${name} in Supabase failed: ${error.message}`);
    counts[name] = count ?? 0;
  }
  return counts;
}

export async function countTarget(): Promise<Counts> {
  const counts: Counts = {};
  for (const { name } of TABLES) {
    const [row] = await query<{ n: number }>(`select count(*)::int as n from public.${name}`);
    counts[name] = row?.n ?? 0;
  }
  return counts;
}

/**
 * Copies every board table in one transaction: it all lands, or none of it.
 * Refuses if Netlify Database already holds board data, unless `replace`.
 */
export async function copyData(
  source: SupabaseClient,
  { replace }: { replace: boolean },
): Promise<{ copied: Counts; droppedColumns: string[] }> {
  const data = new Map<TableName, Row[]>();
  for (const { name, order } of TABLES) data.set(name, await readTable(source, name, order));

  return transaction(async (tx) => {
    const [existing] = await tx.query<{ n: number }>(
      `select (select count(*) from public.members) + (select count(*) from public.motions) as n`,
    );
    if (Number(existing?.n ?? 0) > 0 && !replace) {
      throw new Error(
        'Netlify Database already has board data. Add ?replace=1 to wipe it and copy again.',
      );
    }
    // Truncate skips the append-only row guards (they police deletes, which
    // this is not) and cascades to sign-in sessions, which start fresh.
    await tx.query(
      `truncate public.audit_log, public.comments, public.motion_attachments, public.votes,
                public.motion_electorate, public.motions, public.members, public.board_settings cascade`,
    );

    const columns = await targetColumns(tx);
    const copied: Counts = {};
    const droppedColumns: string[] = [];
    // Past ballots are history: the guard that only accepts ballots on an
    // open vote is paused for the copy, inside this transaction only.
    await tx.query('alter table public.votes disable trigger votes_guard');
    for (const { name } of TABLES) {
      const rows = data.get(name) ?? [];
      droppedColumns.push(...(await insertRows(tx, name, rows, columns.get(name) ?? new Map())));
      copied[name] = rows.length;
    }
    await tx.query('alter table public.votes enable trigger votes_guard');
    // The meeting page needs its settings row even if Supabase had none.
    await tx.query(
      'insert into public.board_settings (id) values (true) on conflict (id) do nothing',
    );
    return { copied, droppedColumns };
  });
}

interface FileItem {
  bucket: Bucket;
  key: string;
  hash: string | null;
  contentType: string;
}

async function fileList(): Promise<FileItem[]> {
  const [attachments, records] = await Promise.all([
    query<{ storage_path: string; file_hash: string; content_type: string }>(
      'select storage_path, file_hash, content_type from public.motion_attachments order by storage_path',
    ),
    query<{ id: string }>(
      'select id from public.motions where status = any($1::text[]) order by id',
      [[...PDF_STATUSES]],
    ),
  ]);
  return [
    ...attachments.map((a) => ({
      bucket: 'motion-attachments' as const,
      key: a.storage_path,
      hash: a.file_hash,
      contentType: a.content_type,
    })),
    ...records.map((m) => ({
      bucket: 'motion-pdfs' as const,
      key: `${m.id}.pdf`,
      hash: null,
      contentType: 'application/pdf',
    })),
  ];
}

export interface FileReport {
  total: number;
  copied: string[];
  alreadyThere: number;
  /** Not in Supabase storage (normal for a PDF that was never generated). */
  notInSupabase: string[];
  failed: string[];
  /** Copied, but the fingerprint does not match the database. */
  fingerprintMismatch: string[];
  /** Not reached in this request; call again. */
  remaining: number;
}

/**
 * Copies documents and PDF records into Netlify Blobs, checking each document
 * against the fingerprint recorded when it was uploaded. Stops after
 * `budgetMs` so the request finishes inside Netlify's time limit; call again
 * until `remaining` is 0. Files already copied are skipped.
 */
export async function copyFiles(
  source: SupabaseClient,
  { replace, budgetMs }: { replace: boolean; budgetMs: number },
): Promise<FileReport> {
  const started = Date.now();
  const items = await fileList();
  const report: FileReport = {
    total: items.length,
    copied: [],
    alreadyThere: 0,
    notInSupabase: [],
    failed: [],
    fingerprintMismatch: [],
    remaining: 0,
  };

  for (const item of items) {
    const label = `${item.bucket}/${item.key}`;
    if (!replace && (await fileExists(item.bucket, item.key))) {
      report.alreadyThere++;
      continue;
    }
    if (Date.now() - started > budgetMs) {
      report.remaining++;
      continue;
    }
    const { data: blob, error } = await source.storage.from(item.bucket).download(item.key);
    if (error || !blob) {
      const msg = error?.message ?? '';
      if (/not.?found|does not exist|400|404/i.test(msg) || !msg) report.notInSupabase.push(label);
      else report.failed.push(`${label}: ${msg}`);
      continue;
    }
    const data = await blob.arrayBuffer();
    if (item.hash) {
      const actual = createHash('sha256').update(new Uint8Array(data)).digest('hex');
      if (actual !== item.hash) report.fingerprintMismatch.push(label);
    }
    try {
      await putFile(item.bucket, item.key, data, blob.type || item.contentType);
      report.copied.push(label);
    } catch (err) {
      report.failed.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}
