import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { submitPostMock } = vi.hoisted(() => ({
  submitPostMock: vi.fn(),
}));

vi.mock('@/app/api/orchestrator/submit/route', () => ({
  POST: submitPostMock,
}));

import { POST } from '@/app/api/orchestrator/run/route';

describe('/api/orchestrator/run route', () => {
  it('delegates to the submit route for backwards compatibility', async () => {
    const expected = new Response(JSON.stringify({ jobId: 'job-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    submitPostMock.mockResolvedValue(expected);

    const req = new NextRequest('http://localhost/api/orchestrator/run', {
      method: 'POST',
      body: JSON.stringify({ command: 'docker compose up' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(submitPostMock).toHaveBeenCalledWith(req);
    expect(res).toBe(expected);
  });
});

