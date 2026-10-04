import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }, { source: "/progress", destination: "/progress/index.html" }, { source: "/progress/", destination: "/progress/index.html" }];
  },
  async headers() {
    return [
      { source: "/progress/progress.json", headers: [{ key: "Cache-Control", value: "no-store" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
