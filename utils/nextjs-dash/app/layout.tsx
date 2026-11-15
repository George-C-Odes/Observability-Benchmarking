import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Providers from './Providers';
import { PreHydrationScript } from './components/PreHydrationScript';
import { RuntimeConfigScript } from './components/RuntimeConfigScript';
import { collectServerSystemInfo } from '@/lib/serverSystemInfo';

export const metadata: Metadata = {
  title: 'Observability Benchmarking Dashboard',
  description: 'Orchestration dashboard for managing benchmarking environment',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const systemInfo = collectServerSystemInfo();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PreHydrationScript />
        <RuntimeConfigScript systemInfo={systemInfo} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
