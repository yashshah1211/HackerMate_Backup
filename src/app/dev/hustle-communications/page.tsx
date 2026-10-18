import { notFound } from 'next/navigation';
import CommunicationDashboard from '@/components/hustle-communications/CommunicationDashboard';
import type { CommunicationRow } from '@/lib/hustle-communications/contracts';

export const metadata = { title: 'Synthetic Round 2 communications', robots: { index: false, follow: false } };
const SYNTHETIC_COMMUNICATION_ROWS: readonly CommunicationRow[] = [
  { teamId: 'fixture-01', teamName: 'Example Orbit', leaderName: 'Synthetic Leader A', registration: 'pending', email: 'queued', whatsapp: 'not_contacted', lastEvidenceAt: null },
  { teamId: 'fixture-02', teamName: 'Example Circuit', leaderName: 'Synthetic Leader B', registration: 'confirmed', email: 'accepted', whatsapp: 'organizer_marked_sent', lastEvidenceAt: '2026-10-23T06:10:00Z' },
  { teamId: 'fixture-03', teamName: 'Example Canvas', leaderName: 'Synthetic Leader C', registration: 'pending', email: 'confirmed_delivered', whatsapp: 'chat_opened', lastEvidenceAt: '2026-10-23T06:15:00Z' },
  { teamId: 'fixture-04', teamName: 'Example Spark', leaderName: 'Synthetic Leader D', registration: 'pending', email: 'unknown', whatsapp: 'not_contacted', lastEvidenceAt: '2026-10-23T06:20:00Z' },
  { teamId: 'fixture-05', teamName: 'Example North', leaderName: 'Synthetic Leader E', registration: 'declined', email: 'rejected', whatsapp: 'organizer_marked_replied', lastEvidenceAt: '2026-10-23T06:25:00Z' },
  { teamId: 'fixture-06', teamName: 'Example Field', leaderName: 'Synthetic Leader F', registration: 'pending', email: 'not_queued', whatsapp: 'not_contacted', lastEvidenceAt: null },
];
export default function CommunicationsFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CommunicationDashboard rows={SYNTHETIC_COMMUNICATION_ROWS} />;
}
