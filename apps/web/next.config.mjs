/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@velyq/database", "@velyq/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config) {
    /*
     * `@velyq/ui` is consumed as TypeScript source (its package export points
     * at `src/index.ts`), and the workspace TS baseline uses NodeNext, which
     * requires relative imports to carry an explicit `.js` extension. Webpack
     * resolves those specifiers literally, so it needs to be told that a
     * `.js` request may be satisfied by the `.ts` file that produces it.
     *
     * This is the standard TypeScript-ESM extension alias; it changes
     * resolution only, never emitted output or runtime behaviour.
     */
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

export default nextConfig;
