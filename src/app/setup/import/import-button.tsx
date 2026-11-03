'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/board/ui';
import { importRecords, type ImportState } from './actions';

const LABELS: Record<string, string> = {
  members: 'Board members',
  motions: 'Motions',
  motion_attachments: 'Documents (records)',
  motion_electorate: 'Voting lists',
  votes: 'Votes',
  comments: 'Comments',
  audit_log: 'History entries',
  board_settings: 'Meeting settings',
};

export function ImportButton() {
  const [state, run, pending] = useActionState<ImportState>(importRecords, { status: 'idle' });

  if (state.status === 'done') {
    const { report } = state;
    const problems = report.files.missing.length + report.files.mismatched.length;
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-good text-body font-semibold">
          Done. The board&apos;s records are here.
        </p>
        <ul className="text-body flex flex-col gap-1">
          {Object.entries(report.rows).map(([table, n]) => (
            <li key={table}>
              {LABELS[table] ?? table}: <strong>{n}</strong>
            </li>
          ))}
          <li>
            Document files copied: <strong>{report.files.copied}</strong>
          </li>
          <li>
            PDF records copied: <strong>{report.records.copied}</strong>
          </li>
        </ul>
        {problems > 0 && (
          <ErrorText>
            {report.files.missing.length > 0 &&
              `Missing in Supabase: ${report.files.missing.join(', ')}. `}
            {report.files.mismatched.length > 0 &&
              `Did not match its fingerprint: ${report.files.mismatched.join(', ')}.`}
          </ErrorText>
        )}
        <p className="text-body">
          Next:{' '}
          <a href="/login" className="text-brand font-semibold underline">
            sign in
          </a>{' '}
          with your board email.
        </p>
      </div>
    );
  }

  return (
    <form action={run} className="flex flex-col gap-3">
      {state.status === 'error' && <ErrorText>{state.message}</ErrorText>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Copying… (this takes under a minute)' : 'Copy the records from Supabase'}
      </Button>
    </form>
  );
}
