'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createCustomTheme } from './theme';
import { useState, useEffect } from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dashboardTheme') || 'dark';
    }
    return 'dark';
  });

  const theme = createCustomTheme(currentTheme);

  useEffect(() => {
    // Log system info on boot
    console.log('='.repeat(80));
    console.log('OBSERVABILITY BENCHMARKING DASHBOARD');
    console.log('='.repeat(80));
    console.log(`Node.js: ${process.version || 'N/A'}`);
    console.log(`Platform: ${typeof window !== 'undefined' ? navigator.platform : 'Server'}`);
    console.log(`User Agent: ${typeof window !== 'undefined' ? navigator.userAgent : 'Server'}`);
    console.log('='.repeat(80));
    
    // Fetch and log backend versions
    fetch('/api/system')
      .then(res => res.json())
      .then(data => {
        console.log('Backend Framework Versions:');
        console.log(`  Next.js: ${data.nextjs}`);
        console.log(`  React: ${data.react}`);
        console.log(`  MUI: ${data.mui}`);
        console.log(`  TypeScript: ${data.typescript}`);
        console.log(`  npm: ${data.npm}`);
        console.log(`  Node.js: ${data.nodejs}`);
        console.log('='.repeat(80));
      })
      .catch(err => console.error('Failed to fetch system info:', err));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardTheme', currentTheme);
    }
  }, [currentTheme]);

  return (
    <html lang="en">
      <head>
        <title>Observability Benchmarking Dashboard</title>
        <meta name="description" content="Orchestration dashboard for managing benchmarking environment" />
      </head>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
