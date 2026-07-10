import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { NotificationProvider } from "@/context/NotificationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HackerMate | Team Operating System",
    template: "%s | HackerMate",
  },
  description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
  keywords: ["hackathon", "teammate finder", "developer networking", "collaboration", "coding team", "builders"],
  authors: [{ name: "HackerMate Team" }],
  openGraph: {
    title: "HackerMate | Team Operating System",
    description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
    url: "https://hackermate.dev",
    siteName: "HackerMate",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HackerMate | Team Operating System",
    description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-[var(--background)]">
        <NotificationProvider>
          <Navbar>{children}</Navbar>
        </NotificationProvider>
      </body>
    </html>
  );
}