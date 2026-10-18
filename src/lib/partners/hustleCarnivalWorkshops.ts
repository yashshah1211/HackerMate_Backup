/** Public, source-reviewed configuration. Never populate from visitor input or event registration data. */
export type OrganizerWorkshopLink = Readonly<{ url: string; organizerApproved: boolean }>;
export type HustleWorkshop = Readonly<{
  id: 'git-github' | 'ai-tools';
  title: string;
  description: string;
  livestream: OrganizerWorkshopLink | null;
  certificateForm: OrganizerWorkshopLink | null;
}>;

export const WORKSHOP_SCHEDULE = {
  date: '24 October 2026',
  start: '2026-10-24T14:20:00+05:30',
  end: '2026-10-24T16:00:00+05:30',
} as const;

// Club Ellusion will supply the official links later. Approval must be recorded
// for EACH URL during review; a recognised host alone does not establish ownership.
export const HUSTLE_WORKSHOPS: readonly HustleWorkshop[] = [
  {
    id: 'git-github',
    title: 'Git & GitHub',
    description: 'Explore Git & GitHub in a public workshop at Hustle Carnival 2026.',
    livestream: null,
    certificateForm: null,
  },
  {
    id: 'ai-tools',
    title: 'Introduction to AI Tools',
    description: 'Explore the world of AI tools in a public workshop at Hustle Carnival 2026.',
    livestream: null,
    certificateForm: null,
  },
];

/** Fail closed for missing, unapproved, malformed or unsupported destinations. */
export function approvedWorkshopUrl(link: OrganizerWorkshopLink | null, kind: 'livestream' | 'certificate'): string | null {
  if (!link || link.organizerApproved !== true) return null;
  try {
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname;
    const path = url.pathname;
    if (kind === 'livestream') {
      const videoId = /^[\w-]{11}$/;
      const youtube = host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com';
      const valid = host === 'youtu.be' && videoId.test(path.slice(1)) || youtube && (
        path === '/watch' && videoId.test(url.searchParams.get('v') || '') ||
        /^\/live\/[\w-]{11}\/?$/.test(path) ||
        /^\/@[\w.-]+(?:\/live)?\/?$/.test(path) ||
        /^\/channel\/UC[\w-]{22}(?:\/live)?\/?$/.test(path) ||
        /^\/(?:c|user)\/[\w.-]+(?:\/live)?\/?$/.test(path)
      );
      return valid ? url.href : null;
    }
    const valid = host === 'forms.gle' && /^\/[\w-]+\/?$/.test(path) ||
      host === 'docs.google.com' && /^\/forms\/d\/(?:e\/)?[\w-]+\/viewform\/?$/.test(path);
    return valid ? url.href : null;
  } catch {
    return null;
  }
}
