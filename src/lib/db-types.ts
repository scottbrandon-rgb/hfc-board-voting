// Row shapes of the board's tables (netlify/database/migrations). Timestamps
// are ISO strings and dates are "YYYY-MM-DD" (see src/lib/db.ts).

export interface MemberRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  phone: string | null;
  notify_new_motions: boolean;
  notify_comments: boolean;
  notify_results: boolean;
}

export interface MotionRow {
  id: string;
  motion_number: string;
  title: string;
  description: string;
  status: string;
  created_by: string;
  moved_by: string | null;
  seconded_by: string | null;
  created_at: string;
  published_at: string | null;
  moved_at: string | null;
  seconded_at: string | null;
  voting_opened_at: string | null;
  decided_at: string | null;
  ratified_at: string | null;
  ratified_by: string | null;
  result: string | null;
  motion_text_hash: string | null;
  withdrawn_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  rules: string;
  background: string | null;
  voting_period_days: number;
  voting_deadline: string | null;
  electorate_size: number | null;
  deadline_extended_at: string | null;
  deadline_extension_note: string | null;
  referred_at: string | null;
  referred_by: string | null;
  referral_reason: string | null;
  referral_note: string | null;
  reminder_24h_sent_at: string | null;
  reminder_final_sent_at: string | null;
  last_call_sent_at: string | null;
  meeting_date: string | null;
  in_person_result: string | null;
  in_person_note: string | null;
  in_person_recorded_at: string | null;
  in_person_recorded_by: string | null;
}

export interface AttachmentRow {
  id: string;
  motion_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  content_type: string;
  file_hash: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface VoteRow {
  id: string;
  motion_id: string;
  member_id: string;
  vote: string;
  cast_at: string;
  motion_hash_at_vote: string;
  reason: string | null;
  note: string | null;
  updated_at: string | null;
  change_count: number;
}

export interface CommentRow {
  id: string;
  motion_id: string;
  member_id: string | null;
  body: string;
  created_at: string;
}
