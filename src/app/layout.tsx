import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";
import { NotificationProvider } from "@/context/NotificationContext";
import { AppProviders } from "./providers";

// V2 type system: Instrument Sans for UI, Bricolage Grotesque for display
// moments (page titles, names, numerals), JetBrains Mono for data and labels.
const uiSans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  axes: ["wdth"],
});

const displayFace = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const codeMono = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.in";
const gaId = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HackerMate | Team Operating System",
    template: "%s | HackerMate",
  },
  description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
  keywords: ["hackathon", "teammate finder", "developer networking", "collaboration", "coding team", "builders"],
  authors: [{ name: "HackerMate Team" }],
  icons: {
    icon: [
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "HackerMate | Team Operating System",
    description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
    url: siteUrl,
    siteName: "HackerMate",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HackerMate — Team Operating System",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HackerMate | Team Operating System",
    description: "Find teammates, discover hackathons, and collaborate with builders who share your vision.",
    images: ["/og-image.png"],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "HackerMate",
    "url": siteUrl,
    "logo": `${siteUrl}/icon-512.png`,
    "sameAs": [
      "https://github.com/HackerMate"
    ],
    "description": "Find teammates, discover hackathons, and collaborate with builders who share your vision."
  };

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`dark ${uiSans.variable} ${displayFace.variable} ${codeMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint (mirrors AppShell's rule:
            public routes and signed-out visitors are always dark). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;var pub=["/","/login","/faq","/terms","/privacy","/contact","/partners","/onboarding"];var forced=pub.indexOf(p)>-1||p.indexOf("/partners/")===0;var t="dark";if(!forced&&localStorage.getItem("hackermate_user_cache")&&localStorage.getItem("theme")==="light"){t="light"}var c=document.documentElement.classList;c.remove("dark","light");c.add(t)}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Simple Analytics */}
        <Script
          src="https://scripts.simpleanalyticscdn.com/latest.js"
          strategy="afterInteractive"
        />
        {gaId && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <Script
              id="google-analytics-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaId}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
      </head>
      <body className="min-h-[100dvh] bg-canvas text-ink font-sans">
        <AppProviders>
          <NotificationProvider>
            <AppShell>{children}</AppShell>
            <Analytics />
          </NotificationProvider>
        </AppProviders>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://queue.simpleanalyticscdn.com/noscript.gif"
            alt=""
            referrerPolicy="no-referrer-when-downgrade"
          />
        </noscript>
      </body>
    </html>
  );
}