export type RuntimeClientConfig = {
  systemInfo?: {
    nodejs: string;
    npm: string;
    nextjs: string;
    react: string;
    mui: string;
    typescript: string;
    platform: string;
    arch: string;
  };
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
