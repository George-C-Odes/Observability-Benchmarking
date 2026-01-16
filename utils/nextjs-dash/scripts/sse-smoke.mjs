// Live integration smoke test for Script Runner (SSE-only path)
//
// It submits a job via nextjs-dash proxy and consumes /api/orchestrator/events
// until it receives a terminalSummary event.

/* global process, console, setTimeout, fetch, TextDecoder */

const base = process.env.NEXTJS_DASH_BASE_URL ?? 'http://localhost:3001';
const command = process.env.ITEST_COMMAND ?? 'docker compose version';

const runId = `itest-${Date.now()}`;
const reqId = `itest-rid-${Date.now()}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Best-effort: wait for Next.js server to be up.
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${base}/api/app-health`, { cache: 'no-store' });
      if (r.ok) break;
    } catch {
      // ignore
    }
    await sleep(500);
  }

  const submit = await fetch(`${base}/api/orchestrator/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': reqId,
    },
    body: JSON.stringify({ command, runId }),
  });

  console.log('submit status', submit.status);
  const submitText = await submit.text();
  console.log('submit raw body', submitText);
  const submitBody = (() => {
    try {
      return JSON.parse(submitText);
    } catch {
      return null;
    }
  })();
  console.log('submit json body', submitBody);

  const jobId = submitBody?.jobId;
  if (typeof jobId !== 'string' || !jobId) {
    throw new Error(`Missing jobId from submit (status=${submit.status})`);
  }

  const eventsUrl = `${base}/api/orchestrator/events?jobId=${encodeURIComponent(jobId)}&runId=${encodeURIComponent(runId)}`;
  console.log('eventsUrl', eventsUrl);

  const res = await fetch(eventsUrl, {
    headers: {
      accept: 'text/event-stream',
      'x-request-id': `${reqId}-events`,
    },
  });

  console.log('events status', res.status, 'content-type', res.headers.get('content-type'));
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`events failed: ${res.status} ${txt}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  let terminal = null;

  const maxFrames = 5000;
  let frameCount = 0;

  // Add a small helper to log SSE frames for debugging.
  const logFrame = (kind, payload) => {
    try {
      console.log(`[sse:${kind}]`, payload);
    } catch {
      // ignore
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += dec.decode(value, { stream: true });

    // Normalize CRLF to LF for robust parsing.
    buffer = buffer.replace(/\r\n/g, '\n');

    while (true) {
      const delim = buffer.indexOf('\n\n');
      if (delim < 0) break;

      const frame = buffer.slice(0, delim);
      buffer = buffer.slice(delim + 2);
      frameCount++;

      if (frameCount > maxFrames) {
        throw new Error('Too many SSE frames without terminalSummary');
      }

      // Parse SSE `data:` lines (allow both `data: ` and `data:`)
      const lines = frame.split('\n');
      const dataLines = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.replace(/^data:\s?/, ''))
        .filter((l) => l.length > 0);

      // Also log comment frames like ": connected ..." for visibility.
      const commentLines = lines.filter((l) => l.startsWith(':'));
      for (const c of commentLines) {
        logFrame('comment', c);
      }

      for (const data of dataLines) {
        let ev;
        try {
          ev = JSON.parse(data);
        } catch {
          logFrame('data', data);
          continue;
        }

        // Log each parsed event
        logFrame('event', ev);

        if (ev?.type === 'summary') {
          console.log('summary', ev.jobStatus, 'rid', ev.requestId ?? null);
        } else if (ev?.type === 'log') {
          console.log('log', ev.stream, ev.message, 'rid', ev.requestId ?? null);
        } else if (ev?.type === 'status') {
          console.log('status', ev.message, 'rid', ev.requestId ?? null);
        } else if (ev?.type === 'terminalSummary') {
          terminal = ev.jobStatus || ev.message;
          console.log('terminalSummary', terminal, 'exitCode', ev.exitCode ?? null, 'rid', ev.requestId ?? null);
          break;
        }
      }

      if (terminal) break;
    }

    if (terminal) break;
  }

  console.log('done terminal=', terminal);
  if (!terminal) process.exit(1);
}

await main();
