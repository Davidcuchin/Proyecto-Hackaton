import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const origin = process.env.API_INTERNAL_ORIGIN ?? "http://127.0.0.1:4318";
    return [
      { source: "/api/v1/:path*", destination: `${origin}/api/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${origin}/api/auth/:path*` },
    ];
  },
};
export default config;
