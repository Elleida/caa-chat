import type { NextConfig } from "next";

const BASE_PATH = "/chatcaa";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  allowedDevOrigins: ["*"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://localhost:8010/:path*",
      },
      // Nota: /ws/* lo gestiona server.js con túnel TCP puro, no Next.js
    ];
  },
};

export default nextConfig;
