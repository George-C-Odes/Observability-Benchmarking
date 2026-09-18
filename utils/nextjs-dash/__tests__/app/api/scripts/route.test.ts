import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/__tests__/_helpers/mockScopedServerLogger';

vi.mock('@/lib/orchestratorClient', () => ({
  getCommandPresets: vi.fn(),
}));

import * as orch from '@/lib/orchestratorClient';
import { GET } from '@/app/api/scripts/route';

describe('/api/scripts route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps orchestrator presets into the frontend script shape', async () => {
    vi.mocked(orch.getCommandPresets).mockResolvedValue([
      {
        title: 'Start OBS',
        command: 'docker compose up -d',
        category: 'multi-cont',
        sourceFile: '.run/start-obs.run.xml',
      },
    ]);

    const res = await GET(new Request('http://localhost/api/scripts') as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      scripts: [
        {
          name: 'Start OBS',
          description: 'multi-cont command',
          command: 'docker compose up -d',
          category: 'multi-cont',
          sourceFile: '.run/start-obs.run.xml',
        },
      ],
    });
  });

  it('returns a 500 response when orchestrator lookup fails', async () => {
    vi.mocked(orch.getCommandPresets).mockRejectedValue(new Error('lookup failed'));

    const res = await GET(new Request('http://localhost/api/scripts') as never);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to fetch scripts from orchestrator service',
      details: 'lookup failed',
    });
  });
});
