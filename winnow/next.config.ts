import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // These load their own files (WebAssembly, PDF.js workers) at runtime, so they must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth"],
  // The console and candidate pages handle private data: never framed by another
  // site, never sniffed, and no referrer (which could carry a token) leaves them.
  async headers() {
    const strict = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [
      { source: "/console/:path*", headers: strict },
      { source: "/console", headers: strict },
      { source: "/api/:path*", headers: strict },
      { source: "/r/:path*", headers: strict },
      { source: "/s/:path*", headers: strict },
    ];
  },
};

export default nextConfig;
