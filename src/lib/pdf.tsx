import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const TZ = process.env.TIMEZONE || 'America/Chicago';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: '0.75in' },
  // Header
  org: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  sub: { fontSize: 9, textAlign: 'center', marginBottom: 2 },
  docTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  provisional: { fontSize: 8, textAlign: 'center', color: '#666', marginBottom: 16 },
  divider: { borderBottom: '0.5pt solid #ccc', marginBottom: 12 },
  // Section heading
  h2: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  // Key-value rows
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 130, fontFamily: 'Helvetica-Bold', flexShrink: 0 },
  value: { flex: 1 },
  // Body text
  body: { lineHeight: 1.5, marginBottom: 4 },
  // Table
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #333',
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  // Vote-specific columns
  col_name: { width: 160 },
  col_vote: { width: 100 },
  col_time: { flex: 1, color: '#555' },
  // Comment block
  commentAuthor: { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  commentDate: { color: '#666', marginBottom: 2 },
  commentBody: { lineHeight: 1.5, marginBottom: 8 },
  // Result banner
  resultBox: { borderRadius: 3, padding: '6pt 10pt', marginTop: 10, marginBottom: 4 },
  resultLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  tallyRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 },
  tallyItem: { alignItems: 'center' },
  tallyNum: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  tallyWord: { fontSize: 8, color: '#555' },
  // Status box
  statusBox: { borderRadius: 3, border: '1pt solid #999', padding: '5pt 10pt', marginTop: 8 },
  statusLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  statusBody: { fontSize: 8, color: '#444', lineHeight: 1.5, marginTop: 4 },
  // Ratification block
  ratifBlock: { marginTop: 14, padding: '10pt 12pt', border: '0.5pt solid #aaa', borderRadius: 3 },
  ratifLine: { marginBottom: 10, borderBottom: '0.5pt solid #aaa', paddingBottom: 2 },
  ratifFilled: { fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: '0.5in',
    left: '0.75in',
    right: '0.75in',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#888',
    borderTop: '0.5pt solid #ddd',
    paddingTop: 4,
  },
  col_th: { fontFamily: 'Helvetica-Bold' },
  quote: {
    lineHeight: 1.5,
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 8,
    borderLeft: '1pt solid #bbb',
    color: '#333',
  },
  col_reason: { width: 120, color: '#555' },
});

function voteLabel(v: string): string {
  switch (v) {
    case 'aye':
      return 'Aye';
    case 'discuss':
      return 'Discuss in person';
    case 'nay':
      return 'Nay';
    case 'abstain':
      return 'Abstain';
    case 'auto_abstain':
      return 'Auto-abstain (no response)';
    case 'defer':
      return 'Move to in-person';
    case 'none':
      return 'Did not vote';
    default:
      return v;
  }
}

const REASONS: Record<string, string> = {
  question: 'Question',
  concern: 'Concern',
  conflict: 'Conflict of interest',
  other: 'Other',
};

const REFERRALS: Record<string, string> = {
  discuss_in_person: 'A member asked to discuss it in person.',
  no_response: 'Not every voting member voted by the deadline.',
  chair: 'Referred by the chair.',
  not_moved: 'No member moved it within the voting period.',
  not_seconded: 'No member seconded it within the voting period.',
  no_quorum: 'Fewer than three voting members were seated.',
};

function plainDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function legacyResultColor(result: string | null): string {
  if (result === 'passed') return '#d1fae5';
  if (result === 'failed') return '#fee2e2';
  if (result === 'deferred') return '#ede9fe';
  return '#f3f4f6';
}

function legacyResultText(result: string | null): string {
  if (result === 'passed') return 'PASSED (PROVISIONAL)';
  if (result === 'failed') return 'FAILED (PROVISIONAL)';
  if (result === 'deferred') return 'DEFERRED TO IN-PERSON SESSION';
  return 'DECIDED';
}

export interface PdfMotionData {
  motion_number: string;
  title: string;
  description: string;
  background: string | null;
  rules: string;
  status: string;
  result: string | null;
  motion_text_hash: string | null;
  voting_opened_at: string | null;
  voting_deadline: string | null;
  decided_at: string | null;
  ratified_at: string | null;
  meeting_date: string | null;
  referral_reason: string | null;
  referral_note: string | null;
  in_person_result: string | null;
  in_person_note: string | null;
  moverName: string | null;
  moved_at: string | null;
  seconderName: string | null;
  seconded_at: string | null;
  chairName: string;
  ratifiedByName: string | null;
  attachments: { file_name: string; file_hash: string }[];
  /** For the current rules, every member of the electorate, including those who did not vote ('none'). */
  votes: {
    memberName: string;
    vote: string;
    reason: string | null;
    note: string | null;
    cast_at: string | null;
  }[];
  comments: { authorName: string; created_at: string; body: string }[];
  generatedAt: string;
}

export function MotionPdf({ data }: { data: PdfMotionData }) {
  const isCurrentRules = data.rules === 'unanimous_v1';
  const isRatified = data.status === 'ratified';
  const isFinalInPerson = data.status === 'decided_in_person';

  const ayes = data.votes.filter((v) => v.vote === 'aye').length;
  const discuss = data.votes.filter((v) => v.vote !== 'aye' && v.vote !== 'none').length;
  const noVote = data.votes.filter((v) => v.vote === 'none').length;

  const legacyTally = { aye: 0, nay: 0, abstain: 0, defer: 0 };
  for (const v of data.votes) {
    if (v.vote === 'aye') legacyTally.aye++;
    else if (v.vote === 'nay') legacyTally.nay++;
    else if (v.vote === 'abstain' || v.vote === 'auto_abstain') legacyTally.abstain++;
    else if (v.vote === 'defer') legacyTally.defer++;
  }

  let resultLabel: string;
  let resultBg: string;
  if (!isCurrentRules) {
    resultLabel = legacyResultText(data.result);
    resultBg = legacyResultColor(data.result);
  } else if (data.status === 'approved' || isRatified) {
    resultLabel = 'APPROVED UNANIMOUSLY ONLINE';
    resultBg = '#d1fae5';
  } else if (data.status === 'referred' || isFinalInPerson) {
    resultLabel = 'REFERRED TO THE IN-PERSON MEETING';
    resultBg = '#fdecd8';
  } else {
    resultLabel = 'VOTING IN PROGRESS';
    resultBg = '#f3f4f6';
  }

  return (
    <Document
      title={`${data.motion_number} — ${data.title}`}
      author="Harrison Faith Church"
      subject="Board Motion Record"
      keywords={`motion_id hfc board`}
      creator="Harrison Faith Board Voting Platform"
    >
      <Page size="LETTER" style={s.page} wrap>
        {/* ── Header ────────────────────────────────────────────── */}
        <Text style={s.org}>HARRISON FAITH CHURCH</Text>
        <Text style={s.sub}>Deacon Board</Text>
        <Text style={s.docTitle}>
          {isRatified || isFinalInPerson ? 'MOTION RECORD' : 'PROVISIONAL MOTION RECORD'}
        </Text>
        <Text style={s.provisional}>
          {isRatified
            ? 'Ratified at an in-person meeting of the board'
            : isFinalInPerson
              ? 'Decided at an in-person meeting of the board'
              : 'Subject to the next regular in-person meeting of the board'}
        </Text>
        <View style={s.divider} />

        {/* ── Motion metadata ───────────────────────────────────── */}
        <View style={s.row}>
          <Text style={s.label}>Motion No.:</Text>
          <Text style={s.value}>{data.motion_number}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Voting opened:</Text>
          <Text style={s.value}>{fmt(data.voting_opened_at)}</Text>
        </View>
        {isCurrentRules && (
          <View style={s.row}>
            <Text style={s.label}>Voting deadline:</Text>
            <Text style={s.value}>{fmt(data.voting_deadline)}</Text>
          </View>
        )}
        <View style={s.row}>
          <Text style={s.label}>Decided online:</Text>
          <Text style={s.value}>{fmt(data.decided_at)}</Text>
        </View>
        {data.meeting_date && (
          <View style={s.row}>
            <Text style={s.label}>Meeting date:</Text>
            <Text style={s.value}>{plainDate(data.meeting_date)}</Text>
          </View>
        )}

        {/* ── Title ─────────────────────────────────────────────── */}
        <Text style={s.h2}>Title</Text>
        <Text style={s.body}>{data.title}</Text>

        {/* ── Motion text ───────────────────────────────────────── */}
        <Text style={s.h2}>Motion</Text>
        <Text style={s.body}>{data.description}</Text>

        {data.background && (
          <>
            <Text style={s.h2}>Background</Text>
            <Text style={s.body}>{data.background}</Text>
          </>
        )}

        {/* ── Attachments ───────────────────────────────────────── */}
        {data.attachments.length > 0 && (
          <>
            <Text style={s.h2}>Attachments</Text>
            {data.attachments.map((a, i) => (
              <Text key={i} style={s.body}>
                {'•'} {a.file_name} (sha256: {a.file_hash.slice(0, 16)}…)
              </Text>
            ))}
          </>
        )}

        {/* ── Motion activity ───────────────────────────────────── */}
        <Text style={s.h2}>Motion Activity</Text>
        <View style={s.row}>
          <Text style={s.label}>Proposed by:</Text>
          <Text style={s.value}>{data.chairName}, Chair</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Moved by:</Text>
          <Text style={s.value}>
            {data.moverName ?? '—'} ({fmt(data.moved_at)})
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Seconded by:</Text>
          <Text style={s.value}>
            {data.seconderName ?? '—'} ({fmt(data.seconded_at)})
          </Text>
        </View>
        {!isCurrentRules && (
          <View style={s.row}>
            <Text style={s.label}>Voting opened by:</Text>
            <Text style={s.value}>
              {data.chairName}, Chair ({fmt(data.voting_opened_at)})
            </Text>
          </View>
        )}

        {/* ── Discussion ────────────────────────────────────────── */}
        {data.comments.length > 0 && (
          <>
            <Text style={s.h2}>Discussion</Text>
            {data.comments.map((c, i) => (
              <View key={i}>
                <Text style={s.commentAuthor}>{c.authorName}</Text>
                <Text style={s.commentDate}>{fmt(c.created_at)}</Text>
                <Text style={s.commentBody}>{c.body}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Roll call ─────────────────────────────────────────── */}
        <Text style={s.h2}>Roll Call</Text>
        <View style={s.tableHeader}>
          <Text style={[s.col_name, s.col_th]}>Member</Text>
          <Text style={[s.col_vote, s.col_th]}>Vote</Text>
          {isCurrentRules && <Text style={[s.col_reason, s.col_th]}>Reason</Text>}
          <Text style={[s.col_time, s.col_th]}>Time</Text>
        </View>
        {data.votes.map((v, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={s.col_name}>{v.memberName}</Text>
            <Text style={s.col_vote}>{voteLabel(v.vote)}</Text>
            {isCurrentRules && (
              <Text style={s.col_reason}>
                {[v.reason ? (REASONS[v.reason] ?? v.reason) : null, v.note ? `“${v.note}”` : null]
                  .filter(Boolean)
                  .join(' — ') || '—'}
              </Text>
            )}
            <Text style={s.col_time}>{v.cast_at ? fmt(v.cast_at) : '—'}</Text>
          </View>
        ))}

        {/* ── Result ────────────────────────────────────────────── */}
        <View style={[s.resultBox, { backgroundColor: resultBg }]}>
          <Text style={s.resultLabel}>RESULT: {resultLabel}</Text>
          <View style={s.tallyRow}>
            {(isCurrentRules
              ? [
                  { n: ayes, w: 'Aye' },
                  { n: discuss, w: 'Discuss in person' },
                  { n: noVote, w: 'Did not vote' },
                ]
              : [
                  { n: legacyTally.aye, w: 'Aye' },
                  { n: legacyTally.nay, w: 'Nay' },
                  { n: legacyTally.abstain, w: 'Abstain' },
                  { n: legacyTally.defer, w: 'Defer' },
                ]
            ).map(({ n, w }) => (
              <View key={w} style={s.tallyItem}>
                <Text style={s.tallyNum}>{n}</Text>
                <Text style={s.tallyWord}>{w}</Text>
              </View>
            ))}
          </View>
        </View>

        {isCurrentRules &&
          (data.status === 'referred' || isFinalInPerson) &&
          data.referral_reason && (
            <View style={{ marginTop: 6 }}>
              <Text style={s.body}>
                {REFERRALS[data.referral_reason] ?? 'Referred to the in-person meeting.'}
              </Text>
              {data.referral_note && <Text style={s.quote}>{data.referral_note}</Text>}
            </View>
          )}

        {isFinalInPerson && (
          <View style={{ marginTop: 6 }}>
            <Text style={s.body}>
              Outcome at the in-person meeting of {plainDate(data.meeting_date)}:{' '}
              {data.in_person_result === 'adopted' ? 'Adopted' : 'Not adopted'}.
            </Text>
            {data.in_person_note && <Text style={s.quote}>{data.in_person_note}</Text>}
          </View>
        )}

        {/* ── Status / legal notice ─────────────────────────────── */}
        <View style={s.statusBox}>
          <Text style={s.statusLabel}>
            STATUS:{' '}
            {isRatified ? 'RATIFIED' : isFinalInPerson ? 'DECIDED IN PERSON' : 'PROVISIONAL'}
          </Text>
          {!isRatified && !isFinalInPerson && (
            <Text style={s.statusBody}>
              {isCurrentRules
                ? 'Online approval requires every seated voting member to vote Aye. This electronic action is provisional; final adoption requires ratification by the Deacon Board at the next regular in-person meeting, per HFC Constitution and Bylaws.'
                : 'This electronic action is non-binding and serves only to expedite deliberation. Final adoption requires ratification by the Deacon Board at the next regular in-person session, per HFC Constitution and Bylaws.'}
            </Text>
          )}
          {isRatified && (
            <Text style={s.statusBody}>
              This motion has been formally ratified by the Deacon Board at an in-person meeting and
              is officially adopted per HFC Constitution and Bylaws.
            </Text>
          )}
          {isFinalInPerson && (
            <Text style={s.statusBody}>
              This motion was decided by the Deacon Board at an in-person meeting.
            </Text>
          )}
        </View>

        {/* ── Integrity hash ────────────────────────────────────── */}
        {data.motion_text_hash && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 7, color: '#999' }}>
              Integrity: sha256 {data.motion_text_hash}
            </Text>
          </View>
        )}

        {/* ── Ratification block ────────────────────────────────── */}
        {!isFinalInPerson && (
          <View style={s.ratifBlock}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 8 }}>
              RATIFICATION BLOCK
            </Text>
            {isRatified ? (
              <>
                <View style={s.row}>
                  <Text style={s.label}>Ratified at meeting of:</Text>
                  <Text style={[s.value, s.ratifFilled]}>
                    {data.meeting_date ? plainDate(data.meeting_date) : fmt(data.ratified_at)}
                  </Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Recorded by:</Text>
                  <Text style={[s.value, s.ratifFilled]}>{data.ratifiedByName ?? '—'}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={s.ratifLine}>
                  <Text style={{ color: '#999', fontSize: 8 }}>
                    Ratified at the regular meeting of: ____________________________
                  </Text>
                </View>
                <View style={s.ratifLine}>
                  <Text style={{ color: '#999', fontSize: 8 }}>
                    Secretary signature: _________________________________________________
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Footer (fixed) ────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text>Motion {data.motion_number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          <Text>Generated {data.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
