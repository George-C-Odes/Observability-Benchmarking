import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Typecheck is run in the dedicated quality-gate stage of the Docker build
  // (and locally via `npm run typecheck`). Skipping it here avoids redundant
  // work during `next build`.
  // Note: ESLint was decoupled from `next build` in Next.js 16; no config needed.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;