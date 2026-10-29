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
  return <CertificateVerification key={id} id={id} />;
}
