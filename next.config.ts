import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "archiver", "puppeteer"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "frame-src 'self' blob:",
              "worker-src 'self' blob:",
              "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
