import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The Docker image sets NEXT_OUTPUT=standalone to get a small, self-contained server
  // (.next/standalone/server.js). Local dev and `next start` (used by the tests) stay as-is.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    serverActions: {
      // CSV imports accept files up to 2 MB; leave room for multipart overhead.
      bodySizeLimit: "3mb",
    },
  },
  // Framing: nothing may be embedded in other sites, except the signup form at /embed/…
  // (writers put it on their own websites in an <iframe>).
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Email previews, shown in iframes by our own pages (templates, designs, landing).
        source: "/previews/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: "/((?!embed/|previews/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
