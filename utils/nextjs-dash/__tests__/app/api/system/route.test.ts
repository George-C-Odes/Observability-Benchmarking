import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { exec } from 'child_process';
import { GET } from '@/app/api/system/route';

describe('/api/system route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns server and package metadata when npm version lookup succeeds', async () => {
    vi.mocked(exec).mockImplementation(((command: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      expect(command).toBe('npm --version');
      callback(null, { stdout: '10.9.3\n', stderr: '' });
      return {} as never;
    }) as never);

    const res = await GET(new Request('http://localhost/api/system') as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nodejs).toBe(process.version);
    expect(body.platform).toBe(process.platform);
    expect(body.arch).toBe(process.arch);
    expect(body.npm).toBe('11.12.1');
    expect(body.nextjs).toBe('16.2.4');
    expect(body.react).toBe('19.2.5');
    expect(body.mui).toBe('9.0.0');
    expect(body.typescript).toBe('6.0.3');
  });

  it('falls back to N/A when npm version lookup fails', async () => {
    vi.mocked(exec).mockImplementation(((command: string, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      callback(new Error('npm missing'), { stdout: '', stderr: 'no npm' });
      return {} as never;
    }) as never);

    const res = await GET(new Request('http://localhost/api/system') as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.npm).toBe('11.12.1');
  });
});

