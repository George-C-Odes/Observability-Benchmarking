import type { JobStatus } from './model';
import { normalizeJobId, isTerminalStatus, computeRestoredLogs } from './model';

type PersistedJobState = {
  jobId: string;
  runId: string | null;
  lastCommand: string | null;
  lastLabel: string | null;
  reconnectCount: number;
  lastJobStatus: JobStatus | null;
  /** Tail of the execution log so refresh can resume without losing progress. */
  eventLogsTail: string[];
};

export type RestoredJobState = {
  jobId: string;
  runId: string | null;
  lastCommand: string | null;
  lastLabel: string | null;
  reconnectCount: number;
  lastJobStatus: JobStatus | null;
  eventLogs: string[];
  shouldReconnect: boolean;
};

const ACTIVE_JOB_STORAGE_NAME = 'scriptRunner.activeJob.v2';

export function writePersistedState(state: PersistedJobState | null) {
  try {
    if (!state) {
      sessionStorage.removeItem(ACTIVE_JOB_STORAGE_NAME);
    } else {
      sessionStorage.setItem(ACTIVE_JOB_STORAGE_NAME, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

function readPersistedState(): PersistedJobState | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_JOB_STORAGE_NAME);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const jobId = (parsed as { jobId?: unknown }).jobId;
    if (typeof jobId !== 'string' || !jobId.trim()) return null;

    return parsed as PersistedJobState;
  } catch {
    return null;
  }
}

export function getRestoredJobState(maxExecutionLogLines: number): RestoredJobState | null {
  const persisted = readPersistedState();
  if (!persisted) return null;

  const jobId = normalizeJobId(persisted.jobId);
  if (!jobId) return null;

  const lastJobStatus = persisted.lastJobStatus || null;
  const shouldReconnect = !isTerminalStatus(lastJobStatus?.status);
  const eventLogs = computeRestoredLogs(
    persisted.eventLogsTail,
    shouldReconnect,
    jobId,
    maxExecutionLogLines,
  );

  return {
    jobId,
    runId: persisted.runId || null,
    lastCommand: persisted.lastCommand || null,
    lastLabel: persisted.lastLabel || null,
    reconnectCount: persisted.reconnectCount || 0,
    lastJobStatus,
    eventLogs,
    shouldReconnect,
  };
}
