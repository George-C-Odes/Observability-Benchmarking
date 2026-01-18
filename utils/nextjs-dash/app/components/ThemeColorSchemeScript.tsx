import Script from 'next/script';

/**
 * Optional but helpful: set the browser's built-in color scheme before hydration.
 * This reduces the perceived flash when switching between light/dark themes.
 */
export function ThemeColorSchemeScript() {
  const code = `(() => {
  try {
    var theme = localStorage.getItem('dashboardTheme');
    // Default Dark is also dark.
    var isLight = theme && /(^light$|mint|sakura|ocean|forest|sunset)/.test(theme);
    document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
  } catch (e) {}
})();`;

  return (
    <Script
      id="theme-colorscheme"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

