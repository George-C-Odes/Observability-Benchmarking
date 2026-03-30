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

/**
 * Injects a tiny runtime config object into the browser for passing server info for display.
 *
 * Safety: the data is double-encoded via JSON.stringify (producing a safe JS
 * string literal) and decoded at runtime with JSON.parse, so the payload is
 * never evaluated as executable code.
 */
export function RuntimeConfigScript(props: RuntimeClientConfig) {
  // Inner JSON.stringify serialises the object → JSON string.
  // Outer JSON.stringify turns that string into a safe JS string literal
  // (all special chars are escaped).  The </script> replacement prevents
  // breaking out of the <script> block in the HTML.
  const safeStringLiteral = JSON.stringify(JSON.stringify(props)).replace(
    /</g,
    '\\u003c',
  );
  const code = `(() => { try { window.__OBS_DASH_CONFIG__ = JSON.parse(${safeStringLiteral}); } catch (e) {} })();`;

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