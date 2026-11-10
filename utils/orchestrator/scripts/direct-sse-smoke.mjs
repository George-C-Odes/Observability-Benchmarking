// Direct orchestrator integration smoke test.
// Verifies POST /v1/run, SSE events, and the terminalSummary event.
import { pathToFileURL } from 'node:url';

function log(label, ...values) {
  // Escape external data so response bodies and terminal controls stay on one line.
  console.log(label, ...values.map((value) => (JSON.stringify(value) ?? 'null')
    .replaceAll(/[\u007f-\u009f\u2028\u2029]/gu,
      (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`)));
}

function orchestratorBase(value) {
  // The trusted local CLI launcher selects the server and optional proxy prefix.
  // Never configure ORCH_BASE_URL from a response or remote request.
  if (/[\s\u0000-\u001f\u007f]/u.test(value)) throw new Error('Invalid ORCH_BASE_URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('ORCH_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment');
  }
  return url.href.replace(/\/$/, '');
}

function eventsUrl(base, jobId, runId) {
  // RunResponse.jobId and the events resource both use java.util.UUID.
  if (typeof jobId !== 'string' || jobId.length !== 36
      || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(jobId)) {
    throw new Error('Missing or invalid jobId');
  }
  return `${base}/v1/jobs/${encodeURIComponent(jobId)}/events?${new URLSearchParams({ runId })}`;
}

function parseData(data) {
  try {
    return JSON.parse(data);
  } catch {
    log('data raw', data);
    return null;
  }
}

function terminalFromFrame(frame) {
  const dataLines = frame.split('\n').filter((line) => line.startsWith('data:'));
  for (const line of dataLines) {
    const event = parseData(line.replace(/^data:\s?/, ''));
    if (!event || typeof event !== 'object') continue;
    log('event', event.type, 'jobStatus', event.jobStatus ?? null, 'msg', event.message ?? null, 'rid', event.requestId ?? null);
    if (event.type === 'terminalSummary') {
      const terminal = event.jobStatus ?? event.message ?? 'terminal';
      log('terminalSummary', terminal, 'exitCode', event.exitCode ?? null, 'rid', event.requestId ?? null);
      return terminal;
    }
  }
  return null;
}

function consumeFrames(state, chunk) {
  state.buffer = (state.buffer + chunk).replaceAll('\r\n', '\n');
  let index = state.buffer.indexOf('\n\n');
  while (index >= 0) {
    const frame = state.buffer.slice(0, index);
    state.buffer = state.buffer.slice(index + 2);
    const terminal = terminalFromFrame(frame);
    if (terminal) return terminal;
    index = state.buffer.indexOf('\n\n');
  }
  return null;
}

function cancelReader(reader) {
  // Handle cancel() rejection, which a synchronous try/catch cannot catch.
  return reader.cancel().catch(() => { /* Stream may already be closed. */ });
}

async function readTerminal(events, env) {
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  const state = { buffer: '' };
  let lastChunkAt = Date.now();
  const timeoutMs = Number(env.ITEST_TIMEOUT_MS ?? 60000);
  const idleTimeoutMs = Number(env.ITEST_IDLE_TIMEOUT_MS ?? 10000);
  const deadline = setTimeout(() => {
    log('timeout waiting for terminalSummary');
    void cancelReader(reader);
  }, timeoutMs);
  const idleWatch = setInterval(() => {
    if (Date.now() - lastChunkAt > idleTimeoutMs) {
      log('idle timeout: no SSE bytes for', idleTimeoutMs, 'ms');
      void cancelReader(reader);
    }
  }, 1000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      lastChunkAt = Date.now();
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) log('[chunk]', chunk.replaceAll('\n', '\\n'));
      const terminal = consumeFrames(state, chunk);
      if (terminal) return terminal;
    }
  } finally {
    clearTimeout(deadline);
    clearInterval(idleWatch);
    await cancelReader(reader);
  }
}

export async function main(env = process.env) {
  const base = orchestratorBase(env.ORCH_BASE_URL ?? 'http://localhost:3002');
  const apiKey = env.ORCH_API_KEY?.trim();
  const authorization = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const runId = `direct-run-${Date.now()}`;
  const rid = `direct-rid-${Date.now()}`;
  const run = await fetch(`${base}/v1/run`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', 'x-request-id': rid, ...authorization },
    body: JSON.stringify({ command: env.ITEST_COMMAND ?? 'docker compose version', runId }),
  });
  log('run status', run.status);
  const runText = await run.text();
  log('run body', runText);
  if (!run.ok) return 2;

  const url = eventsUrl(base, JSON.parse(runText)?.jobId, runId);
  log('eventsUrl', url);
  // Request-forgery false positive: the trusted local launcher selects the base;
  // eventsUrl requires a UUID, encodes its path component, and fixes the endpoint.
  // Query values use URLSearchParams; redirects are rejected below. Reassess if
  // a launcher ever accepts a base URL from a remote request or API response.
  const events = await fetch(url, { // NOSONAR -- validated UUID on a fixed events endpoint; see rationale above.
    redirect: 'error',
    headers: {
      accept: 'text/event-stream',
      'x-request-id': `${rid}-events`,
      connection: 'keep-alive',
      'accept-encoding': 'identity',
      ...authorization,
    },
  });
  log('events status', events.status, 'content-type', events.headers.get('content-type'));
  if (!events.ok) {
    log('events body', await events.text().catch(() => ''));
    return 3;
  }
  const terminal = await readTerminal(events, env);
  log('done terminal=', terminal);
  return terminal ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    log('smoke failed', error.message);
    process.exitCode = 1;
  }
}
