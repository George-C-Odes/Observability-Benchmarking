// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import ClientHome from '@/app/components/ClientHome';

vi.mock('@/app/Providers', () => ({
  useDashboardTheme: () => ({ currentTheme: 'cyberpunk' }),
}));

it('server-renders the default tab and defers the theme selector until hydration', () => {
  const html = renderToString(<ClientHome />);
  expect(html).toMatch(/aria-selected="true"[^>]*>Service Health/);
  expect(html).toMatch(/role="combobox"[^>]*aria-disabled="true"/);
  expect(html).not.toContain('Cyberpunk');
});
