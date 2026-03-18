import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://localhost:8010/:path*",
      },
      {
        source: "/ws/:path*",
        destination: "http://localhost:8010/ws/:path*",
      },
    ];
  },
};

export default nextConfig;
