/**
 * Client-safe configuration.
 *
 * This is intentionally separate from lib/config.ts (which reads process.env and is server-only).
 */

export type PublicConfig = {
  orchestratorPublicUrl: string;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getPublicConfig(): PublicConfig {
  const base = process.env.NEXT_PUBLIC_ORCH_URL || '';
  if (!base) {
    // Empty means: use relative /api/* routes (dev-friendly fallback)
    return { orchestratorPublicUrl: '' };
  }
  return { orchestratorPublicUrl: normalizeBaseUrl(base) };
}

