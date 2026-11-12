import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../scripts/sse-smoke.mjs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const nativeFetch = globalThis.fetch;

function expectSafeLog(output: string) {
  for (const character of ['\r', '\n', '\u001b', '\u0085', '\u2028', '\u2029']) {
    expect(output).not.toContain(character);
  }
}

const jobId = '01234567-89ab-4cde-8fab-0123456789ab';
const encoder = new TextEncoder();
const fetchMock = vi.fn<typeof fetch>();

function streamResponse(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function submitResponse(body: unknown = { jobId }) {
  fetchMock.mockResolvedValueOnce(new Response('ok'));
  fetchMock.mockResolvedValueOnce(Response.json(body));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SSE smoke request boundary', () => {
  it.each([
    'file:///tmp/dashboard',
    'javascript:alert(1)',
    'http://user:secret@localhost:3001',
    'http://localhost:3001?route=other',
    'http://localhost:3001#fragment',
    'http://localhost:3001\n',
  ])('rejects invalid base %j without requests', async (base) => {
    await expect(main({ NEXTJS_DASH_BASE_URL: base })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '..',
    '../other',
    '../../v1/env?ignored=',
    '%2e%2e%2fother',
    'id?admin=true',
    'id#fragment',
    '//evil.example',
    'a/b',
    'a\\b',
    `${jobId}\n`,
    '',
    null,
    42,
  ])('rejects response jobId %j before the events request', async (invalid) => {
    submitResponse({ jobId: invalid });
    await expect(main({})).rejects.toThrow('Missing or invalid jobId');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves the configured origin, proxy prefix, command and request IDs', async () => {
    submitResponse();
    fetchMock.mockResolvedValueOnce(
      streamResponse([
        ': connected\r',
        '\ndata: {"type":"status","message":"running"}\r\n\r',
        '\ndata: {"type":"terminalSummary","jobStatus":"SUCCEEDED"}\r\n\r\n',
      ]),
    );
    expect(
      await main({
        NEXTJS_DASH_BASE_URL: 'https://dash.example/proxy/',
        ITEST_COMMAND: 'docker version',
      }),
    ).toBe(0);
    const [health, submit, events] = fetchMock.mock.calls;
    expect(health[0]).toBe('https://dash.example/proxy/api/app-health');
    expect(submit[0]).toBe('https://dash.example/proxy/api/orchestrator/submit');
    const body = JSON.parse(submit[1]!.body as string);
    expect(body.command).toBe('docker version');
    expect(submit[1]!.method).toBe('POST');
    expect(submit[1]!.headers).toMatchObject({ 'content-type': 'application/json' });
    const url = new URL(String(events[0]));
    expect(url.origin + url.pathname).toBe('https://dash.example/proxy/api/orchestrator/events');
    expect([...url.searchParams]).toEqual([
      ['jobId', jobId],
      ['runId', body.runId],
    ]);
    expect(events[1]!.headers).toMatchObject({ accept: 'text/event-stream' });
    const rid = (submit[1]!.headers as Record<string, string>)['x-request-id'];
    expect(events[1]!.headers).toMatchObject({ 'x-request-id': `${rid}-events` });
    for (const [, options] of fetchMock.mock.calls) expect(options!.redirect).toBe('error');
  });

  it('escapes control characters in raw, nested and SSE logs', async () => {
    const message = 'untrusted\r\nforged\x1b[31m\u0085\u2028\u2029';
    submitResponse({ jobId, nested: { message } });
    fetchMock.mockResolvedValueOnce(
      streamResponse([
        ': comment\x1b\u0085\n\ndata: malformed\x1b\n\n',
        `data: ${JSON.stringify({ type: 'log', message })}\n\n`,
        `data: ${JSON.stringify({ type: 'terminalSummary', message })}\n\n`,
      ]),
    );
    expect(await main({})).toBe(0);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.join(' '))
      .join('');
    expect(output).toContain('forged');
    expectSafeLog(output);
    expect(output).toContain('\\r\\n');
  });

  it('returns failure when the stream ends without a terminal summary', async () => {
    submitResponse();
    fetchMock.mockResolvedValueOnce(streamResponse([': connected\n\n']));
    expect(await main({})).toBe(1);
  });

  it('retains the frame limit', async () => {
    submitResponse();
    fetchMock.mockResolvedValueOnce(streamResponse([': ping\n\n'.repeat(5001)]));
    await expect(main({})).rejects.toThrow('Too many SSE frames');
  });

  it('propagates event request errors without making another request', async () => {
    submitResponse();
    fetchMock.mockRejectedValueOnce(new TypeError('redirect rejected'));
    await expect(main({})).rejects.toThrow('redirect rejected');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps error response content out of thrown errors and sanitizes its log', async () => {
    submitResponse();
    fetchMock.mockResolvedValueOnce(new Response('forged\n\x1b[31m', { status: 500 }));
    await expect(main({})).rejects.toThrow('events failed: 500');
    expectSafeLog(vi.mocked(console.log).mock.calls.flat().join(''));
  });

  it.each(['submit', 'events'])(
    'rejects a real %s redirect without contacting its destination',
    async (operation) => {
      const requests: string[] = [];
      const server = createServer((request, response) => {
        const path = request.url!;
        requests.push(path);
        if (path === '/api/app-health') {
          response.end('ok');
        } else if (path.startsWith(`/api/orchestrator/${operation}`)) {
          response.writeHead(302, { location: '/unexpected' });
          response.end();
        } else {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ jobId }));
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      vi.stubGlobal('fetch', nativeFetch);
      try {
        const port = (server.address() as AddressInfo).port;
        await expect(main({ NEXTJS_DASH_BASE_URL: `http://127.0.0.1:${port}` })).rejects.toThrow();
        expect(requests).toHaveLength(operation === 'submit' ? 2 : 3);
        expect(requests).not.toContain('/unexpected');
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});
