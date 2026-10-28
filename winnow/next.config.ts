import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // These load their own files (WebAssembly, PDF.js workers) at runtime, so they must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth"],
};

export default nextConfig;
