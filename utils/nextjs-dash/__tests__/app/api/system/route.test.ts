import packageJson from '@/package.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/__tests__/_helpers/mockScopedServerLogger';
import { GET } from '@/app/api/system/route';
import { collectServerSystemInfo } from '@/lib/serverSystemInfo';

afterEach(() => vi.unstubAllEnvs());

describe('/api/system shared server metadata', () => {
  it('returns the metadata shared by the root layout and API', async () => {
    const res = await GET(new Request('http://localhost/api/system') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(collectServerSystemInfo());
    expect(collectServerSystemInfo()).toEqual({
      nodejs: process.version,
      platform: process.platform,
      arch: process.arch,
      npm: packageJson.packageManager.slice(4),
      nextjs: packageJson.dependencies.next,
      react: packageJson.dependencies.react,
      mui: packageJson.dependencies['@mui/material'],
      typescript: packageJson.devDependencies.typescript,
    });
  });
  it('uses the pinned package manager version when the launcher reports another version', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/1.0.0 node/v26 linux x64');
    expect(collectServerSystemInfo().npm).toBe(packageJson.packageManager.slice(4));
  });
});
