import 'server-only';
import { getDatabase } from '@netlify/database';

/**
 * Netlify Database access. The connection string comes from NETLIFY_DB_URL,
 * which Netlify sets in every build and function (for local work, put a
 * Postgres URL in .env.local). `@netlify/database` picks the right driver
 * for the platform; both drivers speak node-postgres's `query` API.
 *
 * Every value is passed as a parameter ($1, $2, …), never spliced into SQL.
 *
 * Rows come back shaped the way the app has always used them: timestamps as
 * ISO strings, dates as YYYY-MM-DD and bigints as numbers.
 */

export type Row = Record<string, unknown>;

interface Field {
  name: string;
  dataTypeID: number;
}
interface QueryResult {
  rows: Row[];
  fields: Field[];
}
interface Client {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  release(): void;
}
interface Pool {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  connect(): Promise<Client>;
}

// One pool per server instance, reused across requests.
const globalForDb = globalThis as unknown as { hfcPool?: Pool };

function pool(): Pool {
  if (!globalForDb.hfcPool) {
    globalForDb.hfcPool = getDatabase().pool as unknown as Pool;
  }
  return globalForDb.hfcPool;
}

const INT8 = 20;
const DATE = 1082;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function normalize(result: QueryResult): Row[] {
  const convert = result.fields.filter((f) =>
    [INT8, DATE, TIMESTAMP, TIMESTAMPTZ].includes(f.dataTypeID),
  );
  if (convert.length === 0) return result.rows;
  for (const row of result.rows) {
    for (const { name, dataTypeID } of convert) {
      const v = row[name];
      if (v === null || v === undefined) continue;
      if (dataTypeID === INT8) row[name] = typeof v === 'string' ? Number(v) : v;
      else if (dataTypeID === DATE && v instanceof Date)
        row[name] = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
      else if (v instanceof Date) row[name] = v.toISOString();
    }
  }
  return result.rows;
}

export interface Executor {
  query<T = Row>(text: string, values?: readonly unknown[]): Promise<T[]>;
}

function executor(target: { query: Pool['query'] }): Executor {
  return {
    async query<T>(text: string, values: readonly unknown[] = []) {
      return normalize(await target.query(text, [...values])) as T[];
    },
  };
}

export const db: Executor = {
  query: (text, values) => executor(pool()).query(text, values),
};

/** Runs a query and returns every row. */
export function query<T = Row>(text: string, values: readonly unknown[] = []): Promise<T[]> {
  return db.query<T>(text, values);
}

/** Runs a query and returns the first row, or null. */
export async function queryOne<T = Row>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  return (await db.query<T>(text, values))[0] ?? null;
}

/** Runs `fn` inside one transaction: all of it applies, or none of it. */
export async function transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const result = await fn(executor(client));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** A database error, shaped for friendlyError(): Postgres code plus message. */
export interface DbError {
  code?: string;
  message: string;
}

export function asDbError(err: unknown): DbError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { code?: unknown; message: unknown };
    return { code: typeof e.code === 'string' ? e.code : undefined, message: String(e.message) };
  }
  return { message: String(err) };
}

/** Runs `fn`, returning `{ data }` or `{ error }` instead of throwing. */
export async function attempt<T>(
  fn: () => Promise<T>,
): Promise<{ data: T; error: null } | { data: null; error: DbError }> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: asDbError(err) };
  }
}

// ─── Voting functions ────────────────────────────────────────────────────────
// The rules live in the database (netlify/database/migrations). These are
// the functions the app calls, with their named parameters.

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
  | 'vote_close_expired'
  | 'vote_claim_reminders'
  | 'admin_transfer_chair';

const PARAM = /^p_[a-z_]+$/;

function call(fn: VotingFunction, args: Record<string, unknown>) {
  const names = Object.keys(args);
  for (const n of names) if (!PARAM.test(n)) throw new Error(`Bad parameter name: ${n}`);
  const list = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  return { text: `public.${fn}(${list})`, values: names.map((n) => args[n]) };
}

/** Calls a voting function that returns one value. */
export async function rpc<T = unknown>(
  fn: VotingFunction,
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: DbError | null }> {
  const { text, values } = call(fn, args);
  const result = await attempt(() => query<{ result: T }>(`select ${text} as result`, values));
  return result.error ? result : { data: result.data[0]?.result ?? null, error: null };
}

/** Calls a voting function that returns rows. */
export async function rpcRows<T = Row>(
  fn: VotingFunction,
  args: Record<string, unknown> = {},
): Promise<{ data: T[] | null; error: DbError | null }> {
  const { text, values } = call(fn, args);
  return attempt(() => query<T>(`select * from ${text}`, values));
}

/** The audit log is append-only; every action writes one row. */
export async function audit(entry: {
  motion_id?: string | null;
  member_id: string | null;
  event_type: string;
  event_data?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}): Promise<void> {
  await query(
    `insert into public.audit_log (motion_id, member_id, event_type, event_data, ip_address, user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.motion_id ?? null,
      entry.member_id,
      entry.event_type,
      entry.event_data ? JSON.stringify(entry.event_data) : null,
      entry.ip_address ?? null,
      entry.user_agent ?? null,
    ],
  ).catch((err) => console.error('[audit] could not record', entry.event_type, err));
}
