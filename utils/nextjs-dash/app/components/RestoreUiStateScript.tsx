import Script from 'next/script';

/**
 * Restores UI state (currently selected tab + theme) BEFORE React hydration.
 *
 * This is critical in production builds to avoid hydration mismatches that can
 * surface as minified React error #418.
 */
export function RestoreUiStateScript() {
  const code = `(() => {
  try {
    var tab = localStorage.getItem('dashboardTab');
    if (tab !== null) {
      document.documentElement.dataset.dashboardTab = tab;
    }
  } catch (e) {}
})();`;

  return (
    <Script
      id="restore-ui-state"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

