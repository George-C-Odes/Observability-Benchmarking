export type JobStatus = {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastLine?: string;
  /** Optional human-friendly job title (script name / UI label). */
  title?: string;
};

export type RunResult = {
  ok: boolean;
  job: JobStatus | null;
  output: string;
};

export function normalizeJobId(jobId: unknown): string | null {
  if (
    typeof jobId !== 'string' ||
    Array.from(jobId).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return null;
  const trimmed = jobId.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(trimmed) ? trimmed : null;
}

export function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed || null;
}

export function isTerminalStatus(status?: string): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED';
}

export function computeRestoredLogs(
  persistedTail: unknown,
  shouldReconnect: boolean,
  jobId: string,
  maxExecutionLogLines: number,
): string[] {
  const tail = Array.isArray(persistedTail) ? persistedTail : [];
  if (!shouldReconnect) {
    return tail.slice(-maxExecutionLogLines);
  }
  const reconnectionMsg = `[client] Restored active job from session: ${jobId}. Reconnecting...`;
  return [...tail, reconnectionMsg].slice(-maxExecutionLogLines);
}

export function getNextJobStatus(
  previous: JobStatus | null,
  effectiveSnapshot: JobStatus,
  jobId: string,
  isTerminal: boolean,
  activeJobId: string | null,
  terminalAlreadyApplied: boolean,
): JobStatus | null {
  if (activeJobId !== jobId) return previous;
  if (!isTerminal && terminalAlreadyApplied) return previous;
  return effectiveSnapshot;
}

export function classifyMetaFailure(status: number, txt: string): { reason: string } | null {
  if (status === 409) {
    return { reason: `Stream rejected as stale run (409). ${txt}` };
  }
  if (status === 404) {
    return {
      reason: `Job is no longer available (404). Orchestrator/Next.js may have restarted. ${txt}`,
    };
  }
  if (status >= 400 && status < 500) {
    return { reason: `Stream validation failed (HTTP ${status}). ${txt}` };
  }
  return null;
}
