import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No static export: we need server-side webhook routes and authenticated
  // server rendering, per product spec. Deployed to Cloudflare Workers via
  // the OpenNext adapter (see wrangler.jsonc / open-next.config.ts).
};

export default nextConfig;

// Enables `getCloudflareContext` during `next dev` for local binding access.
// Safe to import even outside a Cloudflare build.
import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => {
  initOpenNextCloudflareForDev();
});
