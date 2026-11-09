// Live integration smoke test for Script Runner (SSE-only path).
import { pathToFileURL } from 'node:url';

function log(label, ...values) {
  // JSON escapes CR/LF and terminal controls, including nested response objects.
  console.log(
    label,
    ...values.map((value) =>
      (JSON.stringify(value) ?? 'null').replaceAll(
        /[\u007f-\u009f\u2028\u2029]/gu,
        (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`,
      ),
    ),
  );
}

function dashboardBase(value) {
  // Only the trusted local CLI launcher may select this origin/proxy prefix.
  // Never populate NEXTJS_DASH_BASE_URL from remote input or a server response.
  if (
    /\s/u.test(value) ||
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || code === 127;
    })
  )
    throw new Error('Invalid NEXTJS_DASH_BASE_URL');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Dashboard base must be an HTTP(S) URL without credentials, query, or fragment',
    );
  }
  return url.href.replace(/\/$/, '');
}

function eventsUrl(base, jobId, runId) {
  // RunResponse.jobId is a java.util.UUID; reject response data before any request.
  if (
    typeof jobId !== 'string' ||
    jobId.length !== 36 ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(jobId)
  ) {
    throw new Error('Missing or invalid jobId from submit');
  }
  return `${base}/api/orchestrator/events?${new URLSearchParams({ jobId, runId })}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function waitForDashboard(base) {
  for (let i = 0; i < 20; i++) {
    try {
      const response = await fetch(`${base}/api/app-health`, {
        cache: 'no-store',
        redirect: 'error',
      });
      if (response.ok) return;
    } catch {
      // Best-effort readiness check.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function logEvent(event) {
  log('[sse:event]', event);
  switch (event?.type) {
    case 'summary':
      log('summary', event.jobStatus, 'rid', event.requestId ?? null);
      break;
    case 'log':
      log('log', event.stream, event.message, 'rid', event.requestId ?? null);
      break;
    case 'status':
      log('status', event.message, 'rid', event.requestId ?? null);
      break;
    case 'terminalSummary': {
      const terminal = event.jobStatus || event.message;
      log(
        'terminalSummary',
        terminal,
        'exitCode',
        event.exitCode ?? null,
        'rid',
        event.requestId ?? null,
      );
      return terminal;
    }
  }
  return null;
}

function terminalFromFrame(frame) {
  const lines = frame.split('\n');
  for (const comment of lines.filter((line) => line.startsWith(':'))) log('[sse:comment]', comment);
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s?/, ''))
    .filter((line) => line.length > 0);
  for (const data of dataLines) {
    const event = parseJson(data);
    if (event === null) {
      log('[sse:data]', data);
      continue;
    }
    const terminal = logEvent(event);
    if (terminal) return terminal;
  }
  return null;
}

function consumeFrames(state, chunk) {
  state.buffer = (state.buffer + chunk).replaceAll('\r\n', '\n');
  let delimiter = state.buffer.indexOf('\n\n');
  while (delimiter >= 0) {
    const frame = state.buffer.slice(0, delimiter);
    state.buffer = state.buffer.slice(delimiter + 2);
    if (++state.frameCount > 5000) throw new Error('Too many SSE frames without terminalSummary');
    const terminal = terminalFromFrame(frame);
    if (terminal) return terminal;
    delimiter = state.buffer.indexOf('\n\n');
  }
  return null;
}

async function readTerminal(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { buffer: '', frameCount: 0 };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      const terminal = consumeFrames(state, decoder.decode(value, { stream: true }));
      if (terminal) return terminal;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** @param {{ NEXTJS_DASH_BASE_URL?: string, ITEST_COMMAND?: string }} env */
export async function main(env = process.env) {
  const base = dashboardBase(env.NEXTJS_DASH_BASE_URL ?? 'http://localhost:3001');
  const runId = `itest-${Date.now()}`;
  const reqId = `itest-rid-${Date.now()}`;
  await waitForDashboard(base);
  const submit = await fetch(`${base}/api/orchestrator/submit`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', 'x-request-id': reqId },
    body: JSON.stringify({ command: env.ITEST_COMMAND ?? 'docker compose version', runId }),
  });
  log('submit status', submit.status);
  const submitText = await submit.text();
  log('submit raw body', submitText);
  const submitBody = parseJson(submitText);
  log('submit json body', submitBody);
  const url = eventsUrl(base, submitBody?.jobId, runId);
  log('eventsUrl', url);
  const response = await fetch(url, {
    redirect: 'error',
    headers: { accept: 'text/event-stream', 'x-request-id': `${reqId}-events` },
  });
  log('events status', response.status, 'content-type', response.headers.get('content-type'));
  if (!response.ok) {
    log('events body', await response.text().catch(() => ''));
    throw new Error(`events failed: ${response.status}`);
  }
  const terminal = await readTerminal(response);
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
