import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from './direct-sse-smoke.mjs';

const jobId = 'c0ffee00-1234-4567-89ab-0123456789ab';
const encoder = new TextEncoder();
const terminal = 'data: {"type":"terminalSummary","jobStatus":"SUCCEEDED","requestId":"rid"}\r\n\r\n';

function harness(t, responses) {
  const calls = [];
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    assert.ok(responses.length, 'Unexpected request');
    return responses.shift();
  });
  return { calls, logs };
}

function runResponse(id = jobId) {
  return Response.json({ jobId: id });
}

function streamResponse(chunks = [terminal]) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
}

test('malicious response IDs never reach the events request', async (t) => {
  const invalid = [undefined, null, 1, {}, [], '', '..', '../../v1/env?', '%2e%2e%2fenv',
    'a/b', 'a\\b', '//evil.example', 'id?query', 'id#fragment', `${jobId}\n`, `${jobId}\r`,
    `${jobId}/..`, `${jobId}%0a`, `${jobId.slice(0, -1)}z`];
  for (const id of invalid) {
    await t.test(JSON.stringify(id) ?? 'undefined', async (child) => {
      const { calls } = harness(child, [Response.json({ jobId: id })]);
      await assert.rejects(main({}), /Missing or invalid jobId/);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], 'http://localhost:3002/v1/run');
    });
  }
});

test('invalid server configuration makes zero requests', async (t) => {
  for (const base of ['file:///etc/passwd', 'ftp://localhost', 'https://user:secret@localhost',
    'http://localhost/?query', 'http://localhost/#fragment', 'http://localhost\n']) {
    await t.test(base, async (child) => {
      const { calls } = harness(child, []);
      await assert.rejects(main({ ORCH_BASE_URL: base }));
      assert.equal(calls.length, 0);
    });
  }
});

test('valid requests preserve command, run correlation, credentials and proxy prefix', async (t) => {
  const { calls, logs } = harness(t, [runResponse(), streamResponse([
    ': heartbeat\r\n\r\ndata: invalid\r\n\r\ndata: null\r\n\r\n',
    terminal.slice(0, -3), terminal.slice(-3),
  ])]);
  assert.equal(await main({ ORCH_BASE_URL: 'https://orchestrator.example/proxy/',
    ORCH_API_KEY: ' synthetic-token ', ITEST_COMMAND: 'docker ps' }), 0);
  const [url, options] = calls[0];
  assert.equal(url, 'https://orchestrator.example/proxy/v1/run');
  assert.equal(options.method, 'POST');
  const body = JSON.parse(options.body);
  assert.equal(body.command, 'docker ps');
  assert.match(body.runId, /^direct-run-\d+$/);
  assert.equal(calls[1][0], `https://orchestrator.example/proxy/v1/jobs/${jobId}/events?runId=${body.runId}`);
  assert.equal(calls[1][1].headers['x-request-id'], `${options.headers['x-request-id']}-events`);
  assert.equal(calls[1][1].headers.accept, 'text/event-stream');
  for (const [, init] of calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, 'Bearer synthetic-token');
  }
  assert.ok(logs.every((line) => !line.includes('synthetic-token')));
});

test('all external log data stays on one line without terminal control characters', async (t) => {
  const hostile = 'forged\nrecord\r\u001b[31m\u007f\u009b31m\u2028\u2029';
  const frame = `data: ${JSON.stringify({ type: 'log', message: hostile, requestId: hostile })}\n\n`;
  const { logs } = harness(t, [Response.json({ jobId, extra: hostile }), streamResponse([
    `data: raw\r\u001b[31m\u2028\u2029\n\n`, frame, terminal,
  ])]);
  assert.equal(await main({}), 0);
  assert.ok(logs.some((line) => line.includes('forged')));
  assert.ok(logs.every((line) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(line)));
});

test('HTTP failure codes and missing terminal summary remain failures', async (t) => {
  for (const [responses, code] of [
    [[new Response('run\nfailed', { status: 403 })], 2],
    [[runResponse(), new Response('events\r\u001b[31mfailed', { status: 500 })], 3],
    [[runResponse(), streamResponse(['data: {"type":"status"}\n\n'])], 1],
  ]) {
    await t.test(`exit ${code}`, async (child) => {
      const { logs } = harness(child, responses);
      assert.equal(await main({}), code);
      assert.ok(logs.every((line) => !/[\n\r\u001b]/u.test(line)));
    });
  }
});

test('rejected reader cancellation is handled after a terminal event', async (t) => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(terminal)); },
    cancel() { cancelled = true; return Promise.reject(new Error('cancel failed')); },
  });
  harness(t, [runResponse(), new Response(stream)]);
  assert.equal(await main({}), 0);
  assert.equal(cancelled, true);
});

test('deadline cancels a silent stream and returns failure', async (t) => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  harness(t, [runResponse(), new Response(stream)]);
  assert.equal(await main({ ITEST_TIMEOUT_MS: '20' }), 1);
  assert.equal(cancelled, true);
});

test('CLI escapes malformed response errors and exits nonzero without an events request', async (t) => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    response.end('\u001b[31mforged\nline\u009b');
  });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./direct-sse-smoke.mjs', import.meta.url))], {
    env: { ...process.env, ORCH_BASE_URL: `http://127.0.0.1:${server.address().port}`, ORCH_API_KEY: 'synthetic-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 1);
  assert.equal(requests, 1);
  assert.equal(stderr, '');
  assert.match(stdout, /smoke failed/);
  assert.doesNotMatch(stdout.replaceAll('\r', '').replaceAll('\n', ''), /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u);
  assert.ok(stdout.trimEnd().split(/\r?\n/u).every((line) => /^(run status|run body|smoke failed) /u.test(line)));
});

test('real fetch rejects redirects on both operations without contacting the destination', async (t) => {
  for (const operation of ['run', 'events']) {
    await t.test(operation, async (child) => {
      const paths = [];
      const server = createServer((request, response) => {
        paths.push(request.url);
        if (request.url === '/destination') {
          response.end('unexpected');
        } else if (operation === 'events' && request.url === '/v1/run') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ jobId }));
        } else {
          response.writeHead(302, { location: '/destination' });
          response.end();
        }
      });
      child.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      child.mock.method(console, 'log', () => {});
      await assert.rejects(main({ ORCH_BASE_URL: `http://127.0.0.1:${server.address().port}`,
        ORCH_API_KEY: 'synthetic-token' }), /fetch failed/);
      assert.equal(paths.includes('/destination'), false);
      assert.equal(paths.length, operation === 'run' ? 1 : 2);
    });
  }
});
