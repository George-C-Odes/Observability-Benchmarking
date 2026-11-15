import { normalizeJobId } from './model';

// UI/persisted job IDs and submit responses are untrusted. Only fixed same-origin
// operations are exposed. Validated IDs are encoded once as query values;
// commands stay in JSON bodies. No credentials or upstream origins enter this adapter.

type SubmitOutcome =
  | { success: true; jobId: string; requestId?: string }
  | { success: false; status: number; message: string; isBusy: boolean };

async function checkStreamMeta(
  request: typeof fetch,
  jobId: string,
  runId: string | null,
): Promise<{ ok: boolean; status: number; txt: string }> {
  if (!normalizeJobId(jobId)) return { ok: false, status: 400, txt: 'Invalid job id' };
  const runIdQuery = runId ? `&runId=${encodeURIComponent(runId)}` : '';
  const metaUrl = `/api/orchestrator/events/meta?jobId=${encodeURIComponent(jobId)}${runIdQuery}`;
  try {
    const metaRes = await request(metaUrl, { cache: 'no-store', redirect: 'error' });
    if (!metaRes.ok) {
      const txt = await metaRes.text().catch(() => '');
      return { ok: false, status: metaRes.status, txt };
    }
    return { ok: true, status: metaRes.status, txt: '' };
  } catch {
    return { ok: false, status: 0, txt: '' };
  }
}

async function submitJobCommand(
  request: typeof fetch,
  command: string,
  label: string,
  tabId: string,
  runId: string,
): Promise<SubmitOutcome> {
  const res = await request('/api/orchestrator/submit', {
    redirect: 'error',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, label, tabId, runId }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    return { success: false, status: res.status, message: bodyText, isBusy: res.status === 503 };
  }

  const json = (await res.json().catch(() => null)) as null | {
    jobId?: string;
    requestId?: string;
  };
  const normalizedJobId = normalizeJobId(json?.jobId);
  if (!normalizedJobId) {
    const invalidMsg = 'Invalid submit response from orchestrator: expected a non-empty jobId.';
    return { success: false, status: 502, message: invalidMsg, isBusy: false };
  }

  return {
    success: true,
    jobId: normalizedJobId,
    requestId: typeof json?.requestId === 'string' ? json.requestId : undefined,
  };
}

export function createJobTransport(request: typeof fetch, open: (url: string) => EventSource) {
  return {
    checkStreamMeta: (jobId: string, runId: string | null) =>
      checkStreamMeta(request, jobId, runId),
    submitJobCommand: (command: string, label: string, tabId: string, runId: string) =>
      submitJobCommand(request, command, label, tabId, runId),
    openEventStream: (jobId: string, runId: string | null, timestamp: number) => {
      if (!normalizeJobId(jobId)) throw new Error('Invalid job id');
      const runIdParam = runId ? `&runId=${encodeURIComponent(runId)}` : '';
      const url = `/api/orchestrator/events?jobId=${encodeURIComponent(jobId)}${runIdParam}&t=${timestamp}`;
      return { source: open(url), url };
    },
  };
}
export type JobTransport = ReturnType<typeof createJobTransport>;
export const browserJobTransport = createJobTransport(
  (input, init) => fetch(input, init),
  (url) => new EventSource(url),
);
