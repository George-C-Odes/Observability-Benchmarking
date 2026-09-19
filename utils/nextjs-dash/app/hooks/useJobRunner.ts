'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useScriptRunnerConfig } from '@/app/hooks/useScriptRunnerConfig';
import { createClientLogger } from '@/lib/clientLogger';

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

type UseJobRunnerState = {
  executing: boolean;
  eventLogs: string[];
  clearEventLogs: () => void;
  /**
   * Fully resets the script-runner execution state (as if no runs were performed).
   * Clears persisted session state and closes any active SSE stream.
   */
  reset: () => void;
  runCommand: (command: string, label?: string) => Promise<RunResult>;
  currentJobId: string | null;
  lastJobStatus: JobStatus | null;
  reconnectCount: number;
  lastCommand: string | null;
  /** Label/title for the currently running job (script name). */
  lastLabel: string | null;
  sseConnected: boolean;
  sseLastError: string | null;
  maxExecutionLogLines: number;
};

type PersistedJobState = {
  jobId: string;
  runId: string | null;
  lastCommand: string | null;
  lastLabel: string | null;
  reconnectCount: number;
  lastJobStatus: JobStatus | null;
  /** Tail of the execution log so refresh can resume without losing progress. */
  eventLogsTail: string[];
  savedAtMs: number;
};

type RestoredJobState = {
  jobId: string;
  runId: string | null;
  lastCommand: string | null;
  lastLabel: string | null;
  reconnectCount: number;
  lastJobStatus: JobStatus | null;
  eventLogs: string[];
  shouldReconnect: boolean;
};

type SseMessageData = {
  type?: string;
  stream?: string;
  ts?: string;
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
  reconnects?: number | null;
  runtimeMs?: number | null;
};

type SubmitOutcome =
  | { success: true; jobId: string; requestId?: string }
  | { success: false; status: number; message: string; isBusy: boolean };

const ACTIVE_JOB_STORAGE_NAME = 'scriptRunner.activeJob.v2';

function writePersistedState(state: PersistedJobState | null) {
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

function getCryptoRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / (0xffffffff + 1);
  }
  return 0.5;
}

function makeTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const rand = Math.floor(getCryptoRandom() * 1_000_000);
    return `${Date.now()}-${rand}`;
  } catch {
    return `${Date.now()}-tab`;
  }
}

function makeRunId(tabId: string, gen: number): string {
  return `${tabId}-${gen}-${Date.now()}`;
}

// Ensure we never treat a non-string jobId as valid (prevents '[object Object]' URLs and React crashes).
function normalizeJobId(jobId: unknown): string | null {
  if (typeof jobId !== 'string') return null;
  const trimmed = jobId.trim();
  return trimmed || null;
}

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed || null;
}

function isTerminalStatus(status?: string): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED';
}

function computeRestoredLogs(
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

function getRestoredJobState(maxExecutionLogLines: number): RestoredJobState | null {
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

function computeReconnectDelay(reconnectAttempt: number): number {
  const base = Math.min(2000, 250 * Math.pow(2, Math.min(3, reconnectAttempt - 1)));
  const jitter = Math.floor(getCryptoRandom() * 150);
  return base + jitter;
}

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

function processSseEvent(raw: string, jobId: string, callbacks: SseEventCallbacks): void {
  const parsed = parseSsePayload(raw, callbacks);
  if (!parsed) return;

  const evJobId = normalizeJobId(parsed.jobId);
  if (evJobId && evJobId !== jobId) return;

  if (typeof parsed.requestId === 'string' && parsed.requestId.trim()) {
    callbacks.onRequestId(parsed.requestId);
  }

  handleSseTypedMessage(parsed, jobId, callbacks);
}

function getNextJobStatus(
  previous: JobStatus | null,
  effectiveSnapshot: JobStatus,
  jobId: string,
  isTerminal: boolean,
  runningJobIdRef: { current: string | null },
  terminalAppliedByJobRef: { current: Set<string> },
): JobStatus | null {
  if (runningJobIdRef.current !== jobId) return previous;
  if (!isTerminal && terminalAppliedByJobRef.current.has(jobId)) return previous;
  return effectiveSnapshot;
}

function updateLastJobStatus(
  setLastJobStatus: Dispatch<SetStateAction<JobStatus | null>>,
  effectiveSnapshot: JobStatus,
  jobId: string,
  isTerminal: boolean,
  runningJobIdRef: { current: string | null },
  terminalAppliedByJobRef: { current: Set<string> },
): void {
  setLastJobStatus((previous) =>
    getNextJobStatus(
      previous,
      effectiveSnapshot,
      jobId,
      isTerminal,
      runningJobIdRef,
      terminalAppliedByJobRef,
    ),
  );
}

async function checkStreamMeta(
  jobId: string,
  runId: string | null,
): Promise<{ ok: boolean; status: number; txt: string }> {
  const runIdQuery = runId ? `&runId=${encodeURIComponent(runId)}` : '';
  const metaUrl = `/api/orchestrator/events/meta?jobId=${encodeURIComponent(jobId)}${runIdQuery}`;
  try {
    const metaRes = await fetch(metaUrl, { cache: 'no-store' });
    if (!metaRes.ok) {
      const txt = await metaRes.text().catch(() => '');
      return { ok: false, status: metaRes.status, txt };
    }
    return { ok: true, status: metaRes.status, txt: '' };
  } catch {
    return { ok: false, status: 0, txt: '' };
  }
}

function classifyMetaFailure(status: number, txt: string): { reason: string } | null {
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

async function submitJobCommand(
  command: string,
  label: string,
  tabId: string,
  runId: string,
): Promise<SubmitOutcome> {
  const res = await fetch('/api/orchestrator/submit', {
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

export function useJobRunner(): UseJobRunnerState {
  const { config: scriptRunnerConfig } = useScriptRunnerConfig();

  const [restoredState] = useState<RestoredJobState | null>(() =>
    getRestoredJobState(scriptRunnerConfig.maxExecutionLogLines),
  );

  const [executing, setExecuting] = useState(false);
  const [eventLogs, setEventLogs] = useState<string[]>(() => restoredState?.eventLogs || []);
  const [currentJobId, setCurrentJobId] = useState<string | null>(
    () => restoredState?.jobId || null,
  );
  const [lastJobStatus, setLastJobStatus] = useState<JobStatus | null>(
    () => restoredState?.lastJobStatus || null,
  );
  const [reconnectCount, setReconnectCount] = useState(() => restoredState?.reconnectCount || 0);
  const [lastCommand, setLastCommand] = useState<string | null>(
    () => restoredState?.lastCommand || null,
  );
  const [lastLabel, setLastLabel] = useState<string | null>(() => restoredState?.lastLabel || null);
  const [sseConnected, setSseConnected] = useState(false);
  const sseConnectedRef = useRef(false);
  const [sseLastError, setSseLastError] = useState<string | null>(null);
  const sseLastRequestIdRef = useRef<string | null>(null);
  const sseConnectStartedAtRef = useRef<number | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const expectedSseCloseRef = useRef(false);
  const activeSseJobIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sseAutoCloseTimerRef = useRef<number | null>(null);

  const tabIdRef = useRef<string>(makeTabId());
  const runningJobIdRef = useRef<string | null>(restoredState?.jobId || null);
  const jobGenerationRef = useRef(0);
  const runIdRef = useRef<string | null>(restoredState?.runId || null);

  const clientLogger = useMemo(() => createClientLogger('useJobRunner'), []);

  const terminalAppliedByJobRef = useRef<Set<string>>(new Set());
  const streamJobEventsRef = useRef<((jobId: string, generation: number) => void) | null>(null);
  const scheduleReconnectRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sseAutoCloseTimerRef.current !== null) {
      window.clearTimeout(sseAutoCloseTimerRef.current);
      sseAutoCloseTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    expectedSseCloseRef.current = true;
    clearTimers();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSseConnected(false);
    sseConnectedRef.current = false;
  }, [clearTimers]);

  const clearEventLogs = useCallback(() => {
    setEventLogs([]);
  }, []);

  const reset = useCallback(() => {
    try {
      closeEventSource();
    } catch {
      // ignore
    }

    runningJobIdRef.current = null;
    runIdRef.current = null;
    activeSseJobIdRef.current = null;
    expectedSseCloseRef.current = true;
    terminalAppliedByJobRef.current.clear();

    jobGenerationRef.current += 1;

    setExecuting(false);
    setEventLogs([]);
    setCurrentJobId(null);
    setLastJobStatus(null);
    setReconnectCount(0);
    setLastCommand(null);
    setLastLabel(null);
    setSseConnected(false);
    sseConnectedRef.current = false;
    setSseLastError(null);
    sseLastRequestIdRef.current = null;
    sseConnectStartedAtRef.current = null;

    writePersistedState(null);
  }, [closeEventSource]);

  const appendLog = useCallback(
    (line: string) => {
      setEventLogs((prev) => {
        const updated = [...prev, line];
        return updated.slice(-scriptRunnerConfig.maxExecutionLogLines);
      });
    },
    [scriptRunnerConfig.maxExecutionLogLines],
  );

  const markTerminalFailed = useCallback(
    (jobId: string, reason: string, extra?: { statusCode?: number; payload?: string }) => {
      terminalAppliedByJobRef.current.add(jobId);
      expectedSseCloseRef.current = true;

      activeSseJobIdRef.current = null;
      runningJobIdRef.current = null;

      setLastJobStatus({
        jobId,
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        lastLine: reason,
        title: lastLabel || undefined,
      });
      appendLog(`[client] ${reason}`);
      if (extra?.statusCode) {
        const payloadSuffix = extra.payload ? ` - ${extra.payload}` : '';
        appendLog(`[client] HTTP ${extra.statusCode}${payloadSuffix}`);
      }

      writePersistedState(null);
      closeEventSource();
    },
    [appendLog, closeEventSource, lastLabel],
  );

  const handleStreamError = useCallback(
    async (jobId: string, generation: number) => {
      const meta = await checkStreamMeta(jobId, runIdRef.current);
      if (jobGenerationRef.current !== generation) return;

      if (!meta.ok && meta.status > 0) {
        const failure = classifyMetaFailure(meta.status, meta.txt);
        if (failure) {
          markTerminalFailed(jobId, failure.reason, { statusCode: meta.status, payload: meta.txt });
          return;
        }
      }

      setSseLastError('SSE connection error');
      const rid = sseLastRequestIdRef.current;
      const ridMeta = rid ? ` rid=${rid}` : '';
      appendLog(`[client] Connection to orchestrator event stream lost. Reconnecting...${ridMeta}`);
      scheduleReconnectRef.current?.();
    },
    [appendLog, markTerminalFailed],
  );

  const streamJobEvents = useCallback(
    (jobId: string, generation: number) => {
      try {
        clearTimers();
        closeEventSource();
        expectedSseCloseRef.current = false;
        activeSseJobIdRef.current = jobId;

        terminalAppliedByJobRef.current.delete(jobId);

        setSseConnected(false);
        setSseLastError(null);
        sseLastRequestIdRef.current = null;
        sseConnectStartedAtRef.current = Date.now();

        let reconnectAttempt = 0;

        scheduleReconnectRef.current = () => {
          if (terminalAppliedByJobRef.current.has(jobId)) return;
          reconnectAttempt += 1;
          setReconnectCount((c) => c + 1);

          const delayMs = computeReconnectDelay(reconnectAttempt);

          reconnectTimerRef.current = window.setTimeout(() => {
            if (jobGenerationRef.current !== generation) return;
            if (activeSseJobIdRef.current !== jobId) return;
            connect();
          }, delayMs);
        };

        const connect = () => {
          if (jobGenerationRef.current !== generation) return;
          if (activeSseJobIdRef.current !== jobId) return;
          if (terminalAppliedByJobRef.current.has(jobId)) return;

          const runId = runIdRef.current;
          clientLogger.debug('Opening SSE', { jobId, generation, runId });

          const cacheBust = Date.now();
          const runIdParam = runId ? `&runId=${encodeURIComponent(runId)}` : '';
          const esUrl = `/api/orchestrator/events?jobId=${encodeURIComponent(jobId)}${runIdParam}&t=${cacheBust}`;

          appendLog(`[client] Opening event stream: ${esUrl}`);

          const es = new EventSource(esUrl);
          eventSourceRef.current = es;

          es.onopen = () => {
            if (jobGenerationRef.current !== generation) {
              es.close();
              return;
            }

            setSseConnected(true);
            sseConnectedRef.current = true;
            setSseLastError(null);

            const startedAt = sseConnectStartedAtRef.current;
            const tookMs =
              typeof startedAt === 'number' ? Math.max(0, Date.now() - startedAt) : null;
            const rid = sseLastRequestIdRef.current;

            const tookSuffix = typeof tookMs === 'number' ? ` (took ${tookMs}ms)` : '';
            const parts = [`[client] Connected to event stream${tookSuffix}`];
            if (rid) parts.push(`rid=${rid}`);
            appendLog(parts.join(' '));
          };

          es.onmessage = (event) => {
            if (jobGenerationRef.current !== generation) {
              expectedSseCloseRef.current = true;
              es.close();
              return;
            }

            processSseEvent(event.data, jobId, {
              onRequestId: (rid) => {
                sseLastRequestIdRef.current = rid;
              },
              onSummary: (snapshot, isTerminal) => {
                const effectiveSnapshot: JobStatus = {
                  ...snapshot,
                  title: snapshot.title || lastLabel || undefined,
                };

                updateLastJobStatus(
                  setLastJobStatus,
                  effectiveSnapshot,
                  jobId,
                  isTerminal,
                  runningJobIdRef,
                  terminalAppliedByJobRef,
                );

                if (isTerminal) {
                  terminalAppliedByJobRef.current.add(jobId);
                  expectedSseCloseRef.current = true;
                  appendLog(
                    `[client] Terminal event received (${effectiveSnapshot.status}). Closing event stream.`,
                  );
                  clearTimers();
                  eventSourceRef.current?.close();
                  eventSourceRef.current = null;
                  setSseConnected(false);
                  sseConnectedRef.current = false;
                }
              },
              onLog: (line) => {
                appendLog(line);
              },
              onRaw: (rawLine) => {
                appendLog(rawLine);
              },
            });
          };

          es.onerror = () => {
            if (jobGenerationRef.current !== generation) {
              expectedSseCloseRef.current = true;
              es.close();
              if (eventSourceRef.current === es) eventSourceRef.current = null;
              return;
            }

            const isExpected = expectedSseCloseRef.current || activeSseJobIdRef.current !== jobId;
            es.close();
            if (eventSourceRef.current === es) eventSourceRef.current = null;
            if (isExpected || terminalAppliedByJobRef.current.has(jobId)) return;

            setSseConnected(false);
            sseConnectedRef.current = false;

            void handleStreamError(jobId, generation);
          };
        };

        connect();

        sseAutoCloseTimerRef.current = window.setTimeout(() => {
          if (jobGenerationRef.current !== generation) return;
          if (terminalAppliedByJobRef.current.has(jobId)) return;

          if (!sseConnectedRef.current) {
            setSseLastError('SSE did not connect before timeout');
            appendLog(
              `[client] Event stream timed out after ${scriptRunnerConfig.eventStreamTimeoutMs}ms (no connection established)`,
            );
            closeEventSource();
          }
        }, scriptRunnerConfig.eventStreamTimeoutMs);
      } catch {
        setSseLastError('Failed to open SSE');
        appendLog('[client] Failed to open orchestrator event stream.');
      }
    },
    [
      appendLog,
      clearTimers,
      closeEventSource,
      lastLabel,
      clientLogger,
      handleStreamError,
      scriptRunnerConfig.eventStreamTimeoutMs,
    ],
  );

  useEffect(() => {
    streamJobEventsRef.current = streamJobEvents;
  }, [streamJobEvents]);

  useEffect(() => {
    if (!restoredState?.shouldReconnect) return;

    jobGenerationRef.current += 1;
    const generation = jobGenerationRef.current;
    const timer = window.setTimeout(() => {
      streamJobEventsRef.current?.(restoredState.jobId, generation);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [restoredState]);

  useEffect(() => {
    const jobId = runningJobIdRef.current;
    if (!jobId) return;

    writePersistedState({
      jobId,
      runId: runIdRef.current,
      lastCommand,
      lastLabel,
      reconnectCount,
      lastJobStatus,
      eventLogsTail: eventLogs.slice(-scriptRunnerConfig.maxExecutionLogLines),
      savedAtMs: Date.now(),
    });
  }, [
    eventLogs,
    lastJobStatus,
    reconnectCount,
    lastCommand,
    lastLabel,
    scriptRunnerConfig.maxExecutionLogLines,
  ]);

  const handleFailedSubmit = useCallback(
    (
      outcome: { status: number; message: string; isBusy: boolean },
      effectiveLabel: string,
    ): RunResult => {
      const { status, message, isBusy } = outcome;
      if (isBusy) {
        appendLog('[client] Orchestrator rejected job submit as busy (503).');
        appendLog(
          message ? `[client] ${message}` : '[client] Try again once the active job completes.',
        );
      } else {
        const msgSuffix = message ? ` - ${message}` : '';
        appendLog(`[client] Submit failed: HTTP ${status}${msgSuffix}`);
      }

      const failLine = isBusy ? 'Orchestrator busy (HTTP 503).' : `Submit failed (HTTP ${status}).`;
      setLastJobStatus({
        jobId: 'N/A',
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        lastLine: failLine,
        title: effectiveLabel,
      });

      return { ok: false, job: null, output: `HTTP ${status} - ${message}` };
    },
    [appendLog],
  );

  const handleSuccessfulSubmit = useCallback(
    (
      outcome: { jobId: string; requestId?: string },
      command: string,
      effectiveLabel: string,
      generation: number,
      runId: string,
    ): RunResult => {
      const { jobId, requestId } = outcome;
      runningJobIdRef.current = jobId;
      setCurrentJobId(jobId);

      const queuedStatus: JobStatus = { jobId, status: 'QUEUED', title: effectiveLabel };

      writePersistedState({
        jobId,
        runId,
        lastCommand: command,
        lastLabel: effectiveLabel,
        reconnectCount: 0,
        lastJobStatus: queuedStatus,
        eventLogsTail: [`[client] Starting command: ${command}`],
        savedAtMs: Date.now(),
      });

      setLastJobStatus(queuedStatus);
      streamJobEvents(jobId, generation);

      const ridTxt = requestId ? ` rid=${requestId}` : '';
      return {
        ok: true,
        job: queuedStatus,
        output: `Job ID: ${jobId}${ridTxt}`,
      };
    },
    [streamJobEvents],
  );

  const runCommand = useCallback(
    async (command: string, label?: string): Promise<RunResult> => {
      setExecuting(true);
      const tabId = tabIdRef.current;

      jobGenerationRef.current += 1;
      const generation = jobGenerationRef.current;

      clearEventLogs();
      setReconnectCount(0);
      setSseLastError(null);
      setLastJobStatus(null);

      const runId = makeRunId(tabId, generation);
      runIdRef.current = runId;

      const effectiveLabel = label || 'Free Text Command';
      setLastLabel(effectiveLabel);
      setLastCommand(command);

      appendLog(`[client] Starting command: ${command}`);

      try {
        const outcome = await submitJobCommand(command, effectiveLabel, tabId, runId);
        if (!outcome.success) {
          return handleFailedSubmit(outcome, effectiveLabel);
        }

        return handleSuccessfulSubmit(outcome, command, effectiveLabel, generation, runId);
      } catch (err) {
        return { ok: false, job: null, output: String(err) };
      } finally {
        setExecuting(false);
      }
    },
    [appendLog, clearEventLogs, handleFailedSubmit, handleSuccessfulSubmit],
  );

  return {
    executing,
    eventLogs,
    clearEventLogs,
    reset,
    runCommand,
    currentJobId,
    lastJobStatus,
    reconnectCount,
    lastCommand,
    lastLabel,
    sseConnected,
    sseLastError,
    maxExecutionLogLines: scriptRunnerConfig.maxExecutionLogLines,
  };
}
