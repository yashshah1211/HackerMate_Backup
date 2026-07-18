import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.100",
  ],
  async rewrites() {
    return [
      {
        source: "/temp-auth/v1/:path*",
        destination: "https://rhryjrbebfrrfhtyyzbs.supabase.co/auth/v1/:path*",
      },
    ];
  },
};

export default nextConfig;