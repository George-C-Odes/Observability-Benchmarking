import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Providers from './Providers';
import { ThemeHydrationScript } from './components/ThemeHydrationScript';
import { ThemeColorSchemeScript } from './components/ThemeColorSchemeScript';
import { RestoreUiStateScript } from './components/RestoreUiStateScript';
import { RuntimeConfigScript } from './components/RuntimeConfigScript';
import packageJson from '../package.json';

export const metadata: Metadata = {
  title: 'Observability Benchmarking Dashboard',
  description: 'Orchestration dashboard for managing benchmarking environment',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

function getPackageVersions() {
  return {
    nextjs: (packageJson as { dependencies?: Record<string, string> }).dependencies?.next || 'N/A',
    react: (packageJson as { dependencies?: Record<string, string> }).dependencies?.react || 'N/A',
    mui: (packageJson as { dependencies?: Record<string, string> }).dependencies?.['@mui/material'] || 'N/A',
    typescript: (packageJson as { devDependencies?: Record<string, string> }).devDependencies?.typescript || 'N/A',
  };
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Orchestrator config remains server-only (see lib/config.ts).

  const pkgs = getPackageVersions();
  const systemInfo = {
    nodejs: process.version,
    npm: process.env.npm_config_user_agent?.split('/')?.[1] ?? 'N/A',
    nextjs: pkgs.nextjs,
    react: pkgs.react,
    mui: pkgs.mui,
    typescript: pkgs.typescript,
    platform: process.platform,
    arch: process.arch,
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeColorSchemeScript />
        <ThemeHydrationScript />
        <RestoreUiStateScript />
        <RuntimeConfigScript systemInfo={systemInfo} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
