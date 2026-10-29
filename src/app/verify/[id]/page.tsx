import type { Metadata } from "next";
import CertificateVerification from "./CertificateVerification";

export const metadata: Metadata = {
  title: "Certificate verification | HackerMate",
  description: "Check a certificate against the issuer’s HackerMate record.",
  robots: { index: false, follow: false, nocache: true, nosnippet: true,
    googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: "no-referrer",
};

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Next 16 App Page params retain the URL-encoded segment (unlike API params).
  // Decode once here; the API lookup then encodes the original identifier once.
  let certificateId: string;
  try { certificateId = decodeURIComponent(id); }
  catch { certificateId = ""; } // Malformed encoding must render invalid, never a lookup.
  return <CertificateVerification key={id} id={certificateId} />;
}
