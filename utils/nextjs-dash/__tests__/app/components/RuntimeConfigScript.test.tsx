import { runInNewContext } from 'node:vm';
import type { ReactElement } from 'react';
import { expect, it } from 'vitest';
import { RuntimeConfigScript } from '@/app/components/RuntimeConfigScript';

it('round-trips runtime metadata without adding HTML markup to the inline script', () => {
  const systemInfo = {
    nodejs: '26',
    npm: '12',
    nextjs: '16',
    react: '19',
    mui: '9',
    typescript: '7',
    platform: '</script> "quoted" \\ path\nλ',
    arch: 'x64',
  };
  const script: ReactElement<{
    strategy: string;
    dangerouslySetInnerHTML: { __html: string };
  }> = RuntimeConfigScript({ systemInfo });
  const code = script.props.dangerouslySetInnerHTML.__html;
  expect(script.props.strategy).toBe('beforeInteractive');
  expect(code).not.toContain('<');

  const browser: Pick<Window, '__OBS_DASH_CONFIG__'> = {};
  runInNewContext(code, { window: browser }, { timeout: 1000 });
  expect(browser.__OBS_DASH_CONFIG__).toEqual({ systemInfo });
});
