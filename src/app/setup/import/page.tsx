import { Monogram } from '@/components/board/ui';
import { importStatus } from '@/lib/import-supabase';
import { ImportButton } from './import-button';

export const metadata = { title: 'Move the records' };
export const dynamic = 'force-dynamic';

/**
 * One-time setup: copies the board's records from Supabase into the new
 * database. Open to anyone only while the new database is empty (nobody can
 * sign in yet); once the records are here, it does nothing.
 */
export default async function ImportPage() {
  let status;
  let problem: string | null = null;
  try {
    status = await importStatus();
  } catch (err) {
    console.error('[import] status check failed:', err);
    problem =
      'The new database is not reachable yet. In Netlify, check Data & Storage → Database, then reload this page.';
  }

  return (
    <main className="bg-page flex min-h-dvh flex-col items-center px-5 pt-12 pb-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Monogram size={56} />
          <h1 className="text-heading font-bold tracking-tight">Move the board&apos;s records</h1>
        </div>
        <div className="border-line flex flex-col gap-4 rounded-2xl border bg-white p-5">
          {problem ? (
            <p className="text-body">{problem}</p>
          ) : status?.alreadyImported ? (
            <p className="text-body">
              The records have already been moved. There is nothing to do here.{' '}
              <a href="/login" className="text-brand font-semibold underline">
                Sign in
              </a>
            </p>
          ) : !status?.supabaseConfigured ? (
            <p className="text-body">
              The Supabase settings are missing on Netlify. Put back{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> (Site
              configuration → Environment variables), redeploy, then reload this page.
            </p>
          ) : (
            <>
              <p className="text-body">
                This copies every member, motion, vote, comment, document and PDF record from
                Supabase into the new database. Supabase is only read, never changed. Press the
                button once.
              </p>
              <ImportButton />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
