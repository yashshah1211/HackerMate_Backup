import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  allowedDevOrigins: [
    "192.168.0.100",
  ],
  async redirects() {
    return [
      {
        source: "/builders",
        destination: "/developers",
        permanent: true,
      },
      {
        source: "/builders/:id",
        destination: "/profile/:id",
        permanent: true,
      },
      {
        source: "/developer/:id",
        destination: "/profile/:id",
        permanent: true,
      },
      {
        source: "/developers/:id",
        destination: "/profile/:id",
        permanent: true,
      },
      {
        source: "/team/:id",
        destination: "/teams/:id",
        permanent: true,
      },
      {
        source: "/team/:id/workspace",
        destination: "/teams/:id/workspace",
        permanent: true,
      },
      {
        source: "/hackathon/:id",
        destination: "/hackathons/:id",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});