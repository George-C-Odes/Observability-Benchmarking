import type { ServerSystemInfo } from '@/lib/systemInfo';

export type RuntimeClientConfig = {
  systemInfo?: ServerSystemInfo;
};

export function getRuntimeConfig(): RuntimeClientConfig {
  const fromWindow = typeof window !== 'undefined' ? window.__OBS_DASH_CONFIG__ : undefined;

  const systemInfo = typeof fromWindow?.systemInfo === 'object' && fromWindow?.systemInfo
    ? (fromWindow.systemInfo as RuntimeClientConfig['systemInfo'])
    : undefined;

  return { systemInfo };
}

declare global {
  interface Window {
    __OBS_DASH_CONFIG__?: Partial<RuntimeClientConfig>;
  }
}
