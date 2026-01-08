'use client';

import { useEffect } from 'react';

export function BootLogger() {
  useEffect(() => {
    // Log system info on boot
    console.log('='.repeat(80));
    console.log('OBSERVABILITY BENCHMARKING DASHBOARD');
    console.log('='.repeat(80));
    console.log('Node.js: N/A');
    console.log(`Platform: ${navigator.platform}`);
    console.log(`User Agent: ${navigator.userAgent}`);
    console.log('='.repeat(80));

    // Fetch and log backend versions
    fetch('/api/system')
      .then((res) => res.json())
      .then((data) => {
        console.log('Backend Framework Versions:');
        console.log(`  Next.js: ${data.nextjs}`);
        console.log(`  React: ${data.react}`);
        console.log(`  MUI: ${data.mui}`);
        console.log(`  TypeScript: ${data.typescript}`);
        console.log(`  npm: ${data.npm}`);
        console.log(`  Node.js: ${data.nodejs}`);
        console.log('='.repeat(80));
      })
      .catch((err) => console.error('Failed to fetch system info:', err));
  }, []);

  return null;
}

