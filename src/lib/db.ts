import 'server-only';
import pg from 'pg';
import { getConnectionString } from '@netlify/database';

/**
 * The board's database: Netlify Database (Postgres). Only the server
 * connects. Netlify supplies the connection string (NETLIFY_DB_URL) on every
 * deploy; for local development and tests, set DATABASE_URL instead.
 *
 * Values come back the way the rest of the app expects them: timestamps as
 * ISO strings, dates as "YYYY-MM-DD", whole numbers as numbers.
 */

function connectionString(): string {
  try {
    return getConnectionString();
  } catch {
    const local = process.env.DATABASE_URL;
    if (local) return local;
    throw new Error(
      'No database connection. On Netlify, create the database under Data & Storage → Database. Locally, set DATABASE_URL.',
    );
  }
}

const TIMESTAMPTZ = 1184;
const TIMESTAMP = 1114;
const DATE = 1082;
const INT8 = 20;

/** "2026-05-01 22:03:25.4964+00" → "2026-05-01T22:03:25.496Z" */
function isoTimestamp(value: string): string {
  const normalized = value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

const types = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === TIMESTAMPTZ || oid === TIMESTAMP) return isoTimestamp;
    if (oid === DATE) return (value: string) => value;
    if (oid === INT8) return (value: string) => Number(value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return pg.types.getTypeParser(oid, format as any);
  },
};

const globalForDb = globalThis as unknown as { __hfcPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForDb.__hfcPool) {
    const p = new pg.Pool({
      connectionString: connectionString(),
      // Serverless functions: a few connections each, released quickly. The
      // database may be asleep, and waking it takes a moment.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
      types,
    });
    p.on('error', (err) => console.error('[db] idle connection error:', err.message));
    globalForDb.__hfcPool = p;
  }
  return globalForDb.__hfcPool;
}

/** Rows of a query. Use $1, $2… for values; never build SQL from input. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool().query(text, params as unknown[]);
  return result.rows as T[];
}

/** The first row of a query, or null. */
export async function one<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Runs `fn` in one transaction: everything is saved, or nothing is. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface DbError {
  code?: string;
  message: string;
}

/**
 * Runs a database call and reports a failure as a value, so actions can show
 * the voting rules' plain-language messages (see friendlyError in dal.ts).
 */
export async function safely<T>(
  fn: () => Promise<T>,
): Promise<{ data: T; error: null } | { data: null; error: DbError }> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { data: null, error: { code: e.code, message: e.message ?? String(err) } };
  }
}

/** The voting engine's functions (netlify/database/migrations/0001_baseline.sql). */
type VotingFunction =
  | 'vote_publish_motion'
  | 'vote_move_motion'
  | 'vote_second_motion'
  | 'vote_withdraw_motion'
  | 'vote_cast_ballot'
  | 'vote_refer_motion'
  | 'vote_extend_deadline'
  | 'vote_mark_call'
  | 'vote_ratify'
  | 'vote_record_in_person'
  | 'admin_transfer_chair';

/**
 * Calls one of the voting functions with named arguments, e.g.
 * rpc('vote_move_motion', { p_motion_id, p_member_id }). Returns its result.
 */
export async function rpc<T = unknown>(
  name: VotingFunction,
  args: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: DbError }> {
  const keys = Object.keys(args);
  if (!keys.every((k) => /^p_[a-z_]+$/.test(k))) throw new Error(`Bad argument name for ${name}`);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  return safely(async () => {
    const row = await one<{ result: T }>(
      `select public.${name}(${list}) as result`,
      keys.map((k) => args[k] ?? null),
    );
    return row?.result as T;
  });
}
