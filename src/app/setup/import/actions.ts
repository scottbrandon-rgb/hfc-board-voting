'use server';

import { runImport, type ImportReport } from '@/lib/import-supabase';

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; report: ImportReport };

export async function importRecords(): Promise<ImportState> {
  try {
    return { status: 'done', report: await runImport() };
  } catch (err) {
    console.error('[import] failed:', err);
    return { status: 'error', message: (err as Error).message };
  }
}
