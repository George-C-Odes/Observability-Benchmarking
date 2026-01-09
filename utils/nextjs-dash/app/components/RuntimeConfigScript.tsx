import Script from 'next/script';

export type RuntimeClientConfig = {
  // Reserved for future public config; keep empty for now.
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

function escapeJsonForHtml(json: string) {
  // Prevent </script> breaking out.
  return json.replace(/</g, '\\u003c');
}

/**
 * Injects a tiny runtime config object into the browser for passing server info for display
 */
export function RuntimeConfigScript(props: RuntimeClientConfig) {
  const payload = escapeJsonForHtml(JSON.stringify(props));
  const code = `(() => { try { window.__OBS_DASH_CONFIG__ = ${payload}; } catch (e) {} })();`;

  return (
    <Script
      id="runtime-config"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

declare global {
  interface Window {
    __OBS_DASH_CONFIG__?: Partial<RuntimeClientConfig>;
  }
}
