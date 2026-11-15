import type { JobStatus } from './model';
import { normalizeJobId, normalizeString } from './model';

type SseMessageData = {
  type?: string;
  stream?: string;
  message?: string;
  jobId?: string;
  jobStatus?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  lastLine?: string | null;
  requestId?: string | null;
  title?: string | null;
};

function isJobStatusKind(status?: string): status is JobStatus['status'] {
  return (
    status === 'QUEUED' ||
    status === 'RUNNING' ||
    status === 'SUCCEEDED' ||
    status === 'FAILED' ||
    status === 'CANCELED'
  );
}

function buildJobSnapshot(jobId: string, parsed: SseMessageData): JobStatus | null {
  if (!isJobStatusKind(parsed.jobStatus)) {
    return null;
  }
  return {
    jobId,
    status: parsed.jobStatus,
    createdAt: parsed.createdAt,
    startedAt: parsed.startedAt,
    finishedAt: parsed.finishedAt,
    exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined,
    lastLine: typeof parsed.lastLine === 'string' ? parsed.lastLine : undefined,
    title: normalizeString(parsed.title) || undefined,
  };
}

function formatLogLine(parsed: SseMessageData): string {
  const msg = parsed.message || '';
  const stream = parsed.stream || 'stdout';
  return stream === 'stderr' ? `[stderr] ${msg}` : msg;
}

function formatStatusMessage(message?: string): string | null {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;
  return `[status] ${trimmed}`;
}

type SseEventCallbacks = {
  onRequestId: (rid: string) => void;
  onSummary: (snapshot: JobStatus, isTerminal: boolean) => void;
  onLog: (line: string) => void;
  onRaw: (line: string) => void;
};

function parseSsePayload(raw: string, callbacks: SseEventCallbacks): SseMessageData | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as SseMessageData;
  } catch {
    callbacks.onRaw(raw);
    return null;
  }
}

function handleSseTypedMessage(
  parsed: SseMessageData,
  jobId: string,
  callbacks: SseEventCallbacks,
): void {
  const type = parsed.type;
  if (type === 'summary' || type === 'terminalSummary') {
    const snapshot = buildJobSnapshot(jobId, parsed);
    if (snapshot) callbacks.onSummary(snapshot, type === 'terminalSummary');
    return;
  }

  if (type === 'log') {
    callbacks.onLog(formatLogLine(parsed));
    return;
  }

  if (type === 'status') {
    const statusLine = formatStatusMessage(parsed.message);
    if (statusLine) callbacks.onLog(statusLine);
  }
}

export function processSseEvent(raw: string, jobId: string, callbacks: SseEventCallbacks): void {
  const parsed = parseSsePayload(raw, callbacks);
  if (!parsed) return;

  const evJobId = normalizeJobId(parsed.jobId);
  if (Object.hasOwn(parsed, 'jobId') && (!evJobId || evJobId !== jobId)) return;

  if (typeof parsed.requestId === 'string' && parsed.requestId.trim()) {
    callbacks.onRequestId(parsed.requestId);
  }

  handleSseTypedMessage(parsed, jobId, callbacks);
}
