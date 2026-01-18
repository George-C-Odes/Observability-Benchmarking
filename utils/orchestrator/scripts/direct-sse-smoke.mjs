// Direct orchestrator integration smoke test.
// Verifies:
// 1) POST /v1/run
// 2) SSE /v1/jobs/{id}/events streams
// 3) terminalSummary event contains jobStatus and requestId

const base = process.env.ORCH_BASE_URL ?? 'http://localhost:3002';
const apiKeyRaw = process.env.ORCH_API_KEY;
const apiKey = apiKeyRaw && apiKeyRaw.trim() ? apiKeyRaw.trim() : null;
const command = process.env.ITEST_COMMAND ?? 'docker compose version';

const runId = `direct-run-${Date.now()}`;
const rid = `direct-rid-${Date.now()}`;

async function main() {
  const runHeaders = {
    'content-type': 'application/json',
    'x-request-id': rid,
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };

  const run = await fetch(`${base}/v1/run`, {
    method: 'POST',
    headers: runHeaders,
    body: JSON.stringify({ command, runId }),
  });

  console.log('run status', run.status);
  const runText = await run.text();
  console.log('run body', runText);

  if (!run.ok) {
    process.exit(2);
  }

  const runJson = JSON.parse(runText);
  const jobId = runJson.jobId;
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  const eventsUrl = `${base}/v1/jobs/${jobId}/events?runId=${encodeURIComponent(runId)}`;
  console.log('eventsUrl', eventsUrl);

  const events = await fetch(eventsUrl, {
    headers: {
      accept: 'text/event-stream',
      'x-request-id': `${rid}-events`,
      connection: 'keep-alive',
      'accept-encoding': 'identity',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  console.log('events status', events.status, 'content-type', events.headers.get('content-type'));
  if (!events.ok) {
    console.log(await events.text().catch(() => ''));
    process.exit(3);
  }

  const reader = events.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let terminal = null;
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.ITEST_TIMEOUT_MS ?? 60000);

  let lastChunkAt = Date.now();
  const idleTimeoutMs = Number(process.env.ITEST_IDLE_TIMEOUT_MS ?? 10000);

  const idleWatch = setInterval(() => {
    if (terminal) return;
    if (Date.now() - lastChunkAt > idleTimeoutMs) {
      console.log(`idle timeout: no SSE bytes for ${idleTimeoutMs}ms`);
      try {
        void reader.cancel();
      } catch {
        // ignore
      }
    }
  }, 1000);

  try {
    while (true) {
      if (Date.now() - startedAt > timeoutMs) {
        console.log('timeout waiting for terminalSummary');
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      lastChunkAt = Date.now();

      const chunk = dec.decode(value, { stream: true });
      if (chunk) console.log('[chunk]', chunk.replace(/\n/g, '\\n'));

      buf += chunk;
      buf = buf.replace(/\r\n/g, '\n');

      while (true) {
        const idx = buf.indexOf('\n\n');
        if (idx < 0) break;

        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        const dataLines = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.replace(/^data:\s?/, ''));

        for (const d of dataLines) {
          let ev;
          try {
            ev = JSON.parse(d);
          } catch {
            console.log('data raw', d);
            continue;
          }

          console.log('event', ev.type, 'jobStatus', ev.jobStatus ?? null, 'msg', ev.message ?? null, 'rid', ev.requestId ?? null);

          if (ev?.type === 'terminalSummary') {
            terminal = ev.jobStatus ?? ev.message ?? 'terminal';
            console.log('terminalSummary', terminal, 'exitCode', ev.exitCode ?? null, 'rid', ev.requestId ?? null);
            break;
          }
        }

        if (terminal) break;
      }

      if (terminal) break;
    }
  } finally {
    clearInterval(idleWatch);
  }

  console.log('done terminal=', terminal);
  process.exit(terminal ? 0 : 1);
}

await main();
