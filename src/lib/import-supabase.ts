import 'server-only';
import { createHash } from 'node:crypto';
import { one, transaction } from '@/lib/db';
import { putFile } from '@/lib/files';
import { pdfKey } from '@/lib/generate-pdf';

/**
 * One-time move of the board's records from Supabase into Netlify Database
 * and Netlify Blobs. Run from /setup/import after the first deploy.
 *
 *   * Runs only while the new database has no members, so it cannot overwrite
 *     anything, and running it twice does nothing the second time.
 *   * Reads Supabase with the settings the site already has on Netlify
 *     (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). It only reads;
 *     Supabase is left exactly as it was.
 *   * Copies every table in one transaction: all of it arrives, or none.
 *   * Copies every document and PDF record, and checks each document against
 *     the fingerprint recorded when it was uploaded.
 *
 * Sign-in accounts and sessions are not copied: members simply sign in again
 * with a code.
 */

/** Tables in the order they must be filled, and how to page through each. */
const TABLES = [
  { name: 'members', order: 'id' },
  { name: 'motions', order: 'id' },
  { name: 'motion_attachments', order: 'id' },
  { name: 'motion_electorate', order: 'motion_id,member_id' },
  { name: 'votes', order: 'id' },
  { name: 'comments', order: 'id' },
  { name: 'audit_log', order: 'id' },
  { name: 'board_settings', order: 'id' },
] as const;

type TableName = (typeof TABLES)[number]['name'];
type Row = Record<string, unknown>;

export interface ImportStatus {
  supabaseConfigured: boolean;
  alreadyImported: boolean;
}

export interface ImportReport {
  rows: Record<string, number>;
  files: { copied: number; missing: string[]; mismatched: string[] };
  records: { copied: number };
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Newer Supabase secret keys go only in `apikey`; older ones are JWTs that
  // also go in Authorization.
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}

export async function importStatus(): Promise<ImportStatus> {
  const row = await one<{ n: number }>('select count(*) as n from public.members');
  return { supabaseConfigured: supabase() !== null, alreadyImported: (row?.n ?? 0) > 0 };
}

async function fetchTable(name: TableName, order: string): Promise<Row[]> {
  const sb = supabase()!;
  const rows: Row[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const res = await fetch(
      `${sb.url}/rest/v1/${name}?select=*&order=${order}&limit=${page}&offset=${offset}`,
      { headers: sb.headers, cache: 'no-store' },
    );
    if (!res.ok) {
      throw new Error(`Could not read ${name} from Supabase (${res.status}): ${await res.text()}`);
    }
    const batch = (await res.json()) as Row[];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

async function fetchObject(bucket: string, key: string): Promise<Uint8Array | null> {
  const sb = supabase()!;
  const path = key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${sb.url}/storage/v1/object/${bucket}/${path}`, {
    headers: sb.headers,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function runImport(): Promise<ImportReport> {
  if (!supabase()) {
    throw new Error(
      'The Supabase settings are missing on Netlify (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).',
    );
  }
  if ((await importStatus()).alreadyImported) {
    throw new Error('The records are already here. Nothing was changed.');
  }

  // 1. Read everything from Supabase first.
  const data = {} as Record<TableName, Row[]>;
  await Promise.all(
    TABLES.map(async (t) => {
      data[t.name] = await fetchTable(t.name, t.order);
    }),
  );
  if (data.members.length === 0) {
    throw new Error('Supabase returned no members. Nothing was changed.');
  }

  // 2. Copy the files. Writing a file twice is harmless, so this can run again.
  const report: ImportReport = {
    rows: {},
    files: { copied: 0, missing: [], mismatched: [] },
    records: { copied: 0 },
  };
  for (const a of data.motion_attachments) {
    const key = String(a.storage_path);
    const bytes = await fetchObject('motion-attachments', key);
    if (!bytes) {
      report.files.missing.push(String(a.file_name));
      continue;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== a.file_hash) report.files.mismatched.push(String(a.file_name));
    await putFile(
      'motion-attachments',
      key,
      bytes,
      String(a.content_type || 'application/octet-stream'),
    );
    report.files.copied++;
  }
  for (const m of data.motions) {
    const key = pdfKey(String(m.id));
    const bytes = await fetchObject('motion-pdfs', key);
    if (!bytes) continue; // Not every motion has a record yet.
    await putFile('motion-pdfs', key, bytes, 'application/pdf');
    report.records.copied++;
  }

  // 3. Copy the tables in one transaction.
  await transaction(async (client) => {
    // Lets past ballots in (see private.guard_votes); this transaction only.
    await client.query(`select set_config('hfc.importing', 'on', true)`);
    await client.query('lock table public.members in exclusive mode');
    const { rows } = await client.query('select count(*)::int as n from public.members');
    if (rows[0].n > 0) throw new Error('The records are already here. Nothing was changed.');

    for (const t of TABLES) {
      const rowsIn = data[t.name];
      if (t.name === 'board_settings') {
        const s = rowsIn[0];
        if (s) {
          await client.query(
            `update public.board_settings
                set next_meeting_at = $1, next_meeting_location = $2, updated_at = $3, updated_by = $4
              where id = true`,
            [
              s.next_meeting_at ?? null,
              s.next_meeting_location ?? null,
              s.updated_at ?? new Date().toISOString(),
              s.updated_by ?? null,
            ],
          );
        }
        report.rows[t.name] = rowsIn.length;
        continue;
      }
      if (rowsIn.length > 0) {
        // Columns are matched by name; the tables have the same shape.
        await client.query(
          `insert into public.${t.name}
           select * from json_populate_recordset(null::public.${t.name}, $1::json)`,
          [JSON.stringify(rowsIn)],
        );
      }
      const counted = await client.query(`select count(*)::int as n from public.${t.name}`);
      if (counted.rows[0].n !== rowsIn.length) {
        throw new Error(
          `${t.name}: Supabase has ${rowsIn.length} rows but ${counted.rows[0].n} arrived. Nothing was changed.`,
        );
      }
      report.rows[t.name] = rowsIn.length;
    }

    await client.query(
      `insert into public.audit_log (event_type, event_data)
       values ('records_imported', $1)`,
      [
        {
          from: 'supabase',
          rows: report.rows,
          files: report.files.copied,
          records: report.records.copied,
        },
      ],
    );
  });

  return report;
}
