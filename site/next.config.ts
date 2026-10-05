import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

// No script-src or default-src: Next's inline hydration scripts must keep working.
// connect-src is site-wide (not /lab-only) so it still applies after client-side navigation into /lab.
const SITE_CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: SITE_CSP },
        ],
      },
      {
        // The handler sets this on its own responses; this also covers Next's automatic 405.
        source: "/api/lab/run",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default withMDX(nextConfig);
