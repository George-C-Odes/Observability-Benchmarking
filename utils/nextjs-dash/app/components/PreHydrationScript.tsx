import Script from 'next/script';

/**
 * Single pre-hydration script that restores theme + tab state from localStorage
 * BEFORE React hydration. Consolidates the previously separate
 * ThemeHydrationScript, ThemeColorSchemeScript, and RestoreUiStateScript into
 * one blocking script evaluation to reduce initial page-load overhead.
 */
export function PreHydrationScript() {
  const code = `(() => {
  try {
    var theme = localStorage.getItem('dashboardTheme');
    if (theme) {
      document.documentElement.dataset.dashboardTheme = theme;
    }

    var isLight = theme && /(^light$|mint|sakura|ocean|forest|sunset)/.test(theme);
    document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

    var tab = localStorage.getItem('dashboardTab');
    if (tab !== null) {
      document.documentElement.dataset.dashboardTab = tab;
    }
  } catch (e) {}
})();`;

  return (
    <Script
      id="pre-hydration"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}