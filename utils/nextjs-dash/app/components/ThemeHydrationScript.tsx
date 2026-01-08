import Script from 'next/script';

/**
 * Runs before React hydration to apply the stored theme to the document.
 * This prevents a flash of the default theme.
 */
export function ThemeHydrationScript() {
  const code = `(() => {
  try {
    var key = 'dashboardTheme';
    var theme = localStorage.getItem(key);
    if (theme) {
      document.documentElement.dataset.dashboardTheme = theme;
    }
  } catch (e) {}
})();`;

  return (
    <Script
      id="theme-hydration"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

