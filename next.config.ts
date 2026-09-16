import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "127.0.0.1:3000",
        "127.0.0.1:3001",
        "192.168.29.121:3000",
        "192.168.29.121:3001",
        "*.devtunnels.ms",
        "*.app.github.dev",
        "*.github.dev",
        "*.ngrok-free.app",
        "*.ngrok.app",
        "*.ngrok.io",
        "*.trycloudflare.com",
        "*.loca.lt",
        "*.localto.net",
      ],
    },
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.29.121",
    "*.devtunnels.ms",
    "*.app.github.dev",
    "*.github.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    "*.loca.lt",
    "*.localto.net",
  ],
  // No static export: we need server-side webhook routes and authenticated
  // server rendering, per product spec. Deployed to Cloudflare Workers via
  // the OpenNext adapter (see wrangler.jsonc / open-next.config.ts).
};

export default nextConfig;

// Enables `getCloudflareContext` during `next dev` for local binding access if requested.
if (process.env.CF_DEV) {
  import("@opennextjs/cloudflare")
    .then(({ initOpenNextCloudflareForDev }) => {
      initOpenNextCloudflareForDev();
    })
    .catch((err) => {
      console.warn("Could not initialize OpenNext Cloudflare dev bindings:", err);
    });
}
