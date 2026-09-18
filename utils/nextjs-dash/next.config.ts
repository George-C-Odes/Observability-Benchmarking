import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // The TypeScript 7 native checker (formerly `tsgo`) runs in the dedicated
  // quality-gate stage of the Docker build and locally via `npm run typecheck`.
  // Skipping it here avoids repeating the strict check during `next build`.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
