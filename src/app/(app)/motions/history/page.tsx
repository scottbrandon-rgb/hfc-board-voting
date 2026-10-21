import { redirect } from 'next/navigation';

// The history page is now the Motions list with the "All" filter.
export default function HistoryRedirect() {
  redirect('/motions?filter=all');
}
