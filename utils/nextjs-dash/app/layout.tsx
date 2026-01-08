import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Providers from './Providers';

export const metadata: Metadata = {
  title: 'Observability Benchmarking Dashboard',
  description: 'Orchestration dashboard for managing benchmarking environment',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
