import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acceso al servidor de dev desde otros hosts de la red local
  // (necesario cuando el frontend se sirve en un servidor y se accede por hostname)
  allowedDevOrigins: ["*"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://localhost:8010/:path*",
      },
    ];
  },
};

export default nextConfig;
