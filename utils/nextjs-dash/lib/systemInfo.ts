export type ServerSystemInfo = {
  nodejs: string;
  npm: string;
  nextjs: string;
  react: string;
  mui: string;
  typescript: string;
  platform: string;
  arch: string;
};

export type ClientSystemInfo = {
  userAgent: string;
  language: string;
  timeZone: string;
  platform: string;
  screen: string;
};

export function collectClientSystemInfo(): ClientSystemInfo {
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // navigator.platform is deprecated. Prefer UA-CH where available.
  // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform
  const uaPlatform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const plat = uaPlatform || 'N/A';

  const scr = `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio || 1}x`;

  return { userAgent: ua, language: lang, timeZone: tz, platform: plat, screen: scr };
}
