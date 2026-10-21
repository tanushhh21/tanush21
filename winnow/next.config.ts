import type { NextConfig } from "next";

// Earlier vercel.app addresses send visitors to the real domain, keeping the path.
const OLD_HOSTS = ["try-winnow.vercel.app", "winnow-sand.vercel.app", "winnow-hiring.vercel.app"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return OLD_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://getwinnow.in/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
