import type { NextConfig } from "next";
import { parseSandboxOrigin } from "./src/lib/appzone-sandbox";

// AppZone apps may only be framed from the sandbox origin. Read directly (not via env()) because
// next.config runs at build time without the full runtime environment; invalid or unset = 'none'.
const appZoneFrameSrc =
  parseSandboxOrigin(process.env.APPZONE_SANDBOX_ORIGIN, process.env.APP_URL || "http://localhost:3000", process.env.NODE_ENV === "production") ??
  "'none'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/apps/:slug/open",
        headers: [
          { key: "Content-Security-Policy", value: `frame-src ${appZoneFrameSrc}; child-src ${appZoneFrameSrc}; object-src 'none'` },
        ],
      },
    ];
  },
};

export default nextConfig;
