'use client';

import { useEffect } from 'react';
import { fetchJson } from '@/lib/fetchJson';

export function BootLogger() {
  useEffect(() => {
    // Defer logging slightly to avoid competing with hydration/layout.
    const id = window.setTimeout(() => {
      console.log('='.repeat(45));
      console.log('OBSERVABILITY BENCHMARKING DASHBOARD');
      console.log('='.repeat(45));
      console.log('Node.js: N/A');
      console.log(`Platform: ${navigator.platform}`);
      console.log(`User Agent: ${navigator.userAgent}`);
      console.log('='.repeat(45));

      void fetchJson<Record<string, string>>('/api/system')
        .then((data) => {
          console.log('Backend Framework Versions:');
          console.log(`  Next.js: ${data.nextjs}`);
          console.log(`  React: ${data.react}`);
          console.log(`  MUI: ${data.mui}`);
          console.log(`  TypeScript: ${data.typescript}`);
          console.log(`  npm: ${data.npm}`);
          console.log(`  Node.js: ${data.nodejs}`);
          console.log('='.repeat(45));
        })
        .catch((err) => console.error('Failed to fetch system info:', err));

      // Also fetch server logs snapshot so the Logs tab has something even if opened later.
      void fetchJson<{ entries?: unknown[] }>('/api/logs')
        .then((data) => {
          if (Array.isArray(data?.entries) && data.entries.length) {
            console.log(`[SERVER LOGS] Loaded ${data.entries.length} server log entries`);
          }
        })
        .catch(() => {
          // ignore
        });
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  return null;
}
