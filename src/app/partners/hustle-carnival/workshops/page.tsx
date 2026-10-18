import type { Metadata } from 'next';
import HustleCarnivalWorkshops from '@/components/partners/HustleCarnivalWorkshops';

const title = 'Public Workshops · Hustle Carnival 2026 × HackerMate';
const description = 'Join Git & GitHub or Introduction to AI Tools on 24 October 2026, 2:20 PM–4:00 PM IST. Public YouTube workshops by Club Ellusion. No registration required.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/partners/hustle-carnival/workshops' },
  openGraph: {
    title, description, url: '/partners/hustle-carnival/workshops',
    images: [{ url: '/partners/hustle-carnival/hustle-carnival-gold-brand-poster.jpeg', width: 1254, height: 1254, alt: 'Club Ellusion — Hustle Carnival, Hustle Beyond' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/partners/hustle-carnival/hustle-carnival-gold-brand-poster.jpeg'] },
};

export default function WorkshopsPage() {
  return <HustleCarnivalWorkshops />;
}
