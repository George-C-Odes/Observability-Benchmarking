'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export type UseJobRunnerState = {
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

const SESSION_KEY = 'scriptRunner.activeJob.v2';

function writePersistedState(state: PersistedJobState | null) {
  try {
    if (!state) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

function readPersistedState(): PersistedJobState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
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

function makeTabId(): string {
  try {
    const rnd = typeof crypto !== 'undefined' ? crypto.randomUUID?.() : undefined;
    return rnd ?? `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function makeRunId(tabId: string, gen: number): string {
  return `${tabId}-${gen}-${Date.now()}`;
}

// Ensure we never treat a non-string jobId as valid (prevents '[object Object]' URLs and React crashes).
function normalizeJobId(jobId: unknown): string | null {
  if (typeof jobId !== 'string') return null;
  const trimmed = jobId.trim();
  return trimmed ? trimmed : null;
}

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

// NOTE: The remainder of this hook had drifted into a different API shape.
// Re-align it to the SSE-only contract: submit -> stream -> terminal.

export function useJobRunner(): UseJobRunnerState {
  const { config: scriptRunnerConfig } = useScriptRunnerConfig();

  const [executing, setExecuting] = useState(false);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [lastJobStatus, setLastJobStatus] = useState<JobStatus | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
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
  const runningJobIdRef = useRef<string | null>(null);
  const jobGenerationRef = useRef(0);
  const runIdRef = useRef<string | null>(null);

  const clientLogger = useMemo(() => createClientLogger('useJobRunner'), []);

  const terminalAppliedByJobRef = useRef<Set<string>>(new Set());
  const streamJobEventsRef = useRef<((jobId: string, generation: number) => void) | null>(null);

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
    // Full reset back to initial state.
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

    jobGenerationRef.current += 1; // invalidate in-flight reconnect loops

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
    [scriptRunnerConfig.maxExecutionLogLines]
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

        const scheduleReconnect = () => {
          if (terminalAppliedByJobRef.current.has(jobId)) return;
          reconnectAttempt += 1;
          setReconnectCount((c) => c + 1);

          const base = Math.min(2000, 250 * Math.pow(2, Math.min(3, reconnectAttempt - 1)));
          const jitter = Math.floor(Math.random() * 150);
          const delayMs = base + jitter;

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
            const tookMs = typeof startedAt === 'number' ? Math.max(0, Date.now() - startedAt) : null;
            const rid = sseLastRequestIdRef.current;

            const parts = [`[client] Connected to event stream${tookMs !== null ? ` (took ${tookMs}ms)` : ''}`];
            if (rid) parts.push(`rid=${rid}`);
            appendLog(parts.join(' '));
          };

          es.onmessage = (event) => {
            if (jobGenerationRef.current !== generation) {
              expectedSseCloseRef.current = true;
              es.close();
              return;
            }

            const raw = event.data;
            if (typeof raw !== 'string' || raw.length === 0) return;

            let parsed: null | {
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
            } = null;

            try {
              parsed = JSON.parse(raw);
            } catch {
              appendLog(raw);
              return;
            }

            // If the server includes a jobId, ignore cross-job frames.
            const evJobId = normalizeJobId(parsed?.jobId);
            if (evJobId && evJobId !== jobId) {
              return;
            }

            if (typeof parsed?.requestId === 'string' && parsed.requestId.trim()) {
              sseLastRequestIdRef.current = parsed.requestId;
            }

            const type = parsed?.type;

            if (type === 'summary' || type === 'terminalSummary') {
              const status = parsed?.jobStatus;
              if (status === 'QUEUED' || status === 'RUNNING' || status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED') {
                const snapshot: JobStatus = {
                  jobId,
                  status,
                  createdAt: parsed?.createdAt,
                  startedAt: parsed?.startedAt,
                  finishedAt: parsed?.finishedAt,
                  exitCode: typeof parsed?.exitCode === 'number' ? parsed.exitCode : undefined,
                  lastLine: typeof parsed?.lastLine === 'string' ? parsed.lastLine : undefined,
                  title: normalizeString(parsed?.title) ?? (lastLabel ?? undefined),
                };

                const isTerminal = type === 'terminalSummary';

                setLastJobStatus((prev) => {
                  if (runningJobIdRef.current !== jobId) return prev;
                  if (!isTerminal && terminalAppliedByJobRef.current.has(jobId)) return prev;
                  return snapshot;
                });

                if (isTerminal) {
                  terminalAppliedByJobRef.current.add(jobId);

                  expectedSseCloseRef.current = true;
                  appendLog(`[client] Terminal event received (${snapshot.status}). Closing event stream.`);

                  clearTimers();
                  eventSourceRef.current?.close();
                  eventSourceRef.current = null;
                  setSseConnected(false);
                  sseConnectedRef.current = false;
                }
              }
              return;
            }

            if (type === 'log') {
              const msg = parsed?.message ?? '';
              const stream = parsed?.stream ?? 'stdout';
              const line = stream === 'stderr' ? `[stderr] ${msg}` : msg;
              appendLog(line);
              return;
            }

            if (type === 'status') {
              const msg = parsed?.message;
              if (typeof msg === 'string' && msg.trim()) {
                if (msg.startsWith(':')) return;
                appendLog(`[status] ${msg}`);
              }
            }
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
            if (isExpected) return;

            if (terminalAppliedByJobRef.current.has(jobId)) return;

            setSseConnected(false);
            sseConnectedRef.current = false;

            const runId = runIdRef.current;

            // Validate against run gating.
            const metaUrl = `/api/orchestrator/events/meta?jobId=${encodeURIComponent(jobId)}${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`;

            const markTerminalFailed = (reason: string, extra?: { statusCode?: number; payload?: string }) => {
              terminalAppliedByJobRef.current.add(jobId);
              expectedSseCloseRef.current = true;

              // Stop any future reconnect attempts for this job.
              activeSseJobIdRef.current = null;
              runningJobIdRef.current = null;

              setLastJobStatus({
                jobId,
                status: 'FAILED',
                finishedAt: new Date().toISOString(),
                lastLine: reason,
                title: lastLabel ?? undefined,
              });
              appendLog(`[client] ${reason}`);
              if (extra?.statusCode) appendLog(`[client] HTTP ${extra.statusCode}${extra.payload ? ` - ${extra.payload}` : ''}`);

              // Clear persisted state so a refresh doesn't resurrect the dead run.
              writePersistedState(null);

              closeEventSource();
            };

            void fetch(metaUrl, { cache: 'no-store' })
              .then(async (metaRes) => {
                if (!metaRes.ok) {
                  const txt = await metaRes.text().catch(() => '');

                  if (metaRes.status === 409) {
                    // Stale run: do not reconnect.
                    markTerminalFailed(`Stream rejected as stale run (409). ${txt}`, { statusCode: metaRes.status, payload: txt });
                    return;
                  }

                  if (metaRes.status === 404) {
                    // Either orchestrator or Next.js restarted and lost run state.
                    markTerminalFailed(`Job is no longer available (404). Orchestrator/Next.js may have restarted. ${txt}`, { statusCode: metaRes.status, payload: txt });
                    return;
                  }

                  if (metaRes.status >= 400 && metaRes.status < 500) {
                    // Client-side error: stop reconnecting.
                    markTerminalFailed(`Stream validation failed (HTTP ${metaRes.status}). ${txt}`, { statusCode: metaRes.status, payload: txt });
                    return;
                  }
                }

                setSseLastError('SSE connection error');
                const rid = sseLastRequestIdRef.current;
                const ridMeta = rid ? ` rid=${rid}` : '';
                appendLog(`[client] Connection to orchestrator event stream lost. Reconnecting...${ridMeta}`);

                scheduleReconnect();
              })
              .catch(() => {
                setSseLastError('SSE connection error');
                appendLog('[client] Connection to orchestrator event stream lost. Reconnecting...');
                scheduleReconnect();
              });
          };
        };

        connect();

        sseAutoCloseTimerRef.current = window.setTimeout(() => {
          if (jobGenerationRef.current !== generation) return;
          if (terminalAppliedByJobRef.current.has(jobId)) return;

          if (!sseConnectedRef.current) {
            setSseLastError('SSE did not connect before timeout');
            appendLog(`[client] Event stream timed out after ${scriptRunnerConfig.eventStreamTimeoutMs}ms (no connection established)`);
            closeEventSource();
          }
        }, scriptRunnerConfig.eventStreamTimeoutMs);
      } catch {
        setSseLastError('Failed to open SSE');
        appendLog('[client] Failed to open orchestrator event stream.');
      }
    },
    [appendLog, clearTimers, closeEventSource, lastLabel, clientLogger, scriptRunnerConfig.eventStreamTimeoutMs]
  );

  useEffect(() => {
    streamJobEventsRef.current = streamJobEvents;
  }, [streamJobEvents]);

  useEffect(() => {
    const persisted = readPersistedState();
    if (!persisted) return;

    const normalizedJobId = normalizeJobId(persisted.jobId);
    if (!normalizedJobId) {
      writePersistedState(null);
      return;
    }

    runIdRef.current = persisted.runId ?? null;
    runningJobIdRef.current = normalizedJobId;
    setCurrentJobId(normalizedJobId);
    setLastCommand(persisted.lastCommand ?? null);
    setLastLabel(persisted.lastLabel ?? null);
    setReconnectCount(persisted.reconnectCount ?? 0);
    setLastJobStatus(persisted.lastJobStatus ?? null);

    const tail = Array.isArray(persisted.eventLogsTail) ? persisted.eventLogsTail : [];
    if (tail.length > 0) {
      setEventLogs(tail.slice(-scriptRunnerConfig.maxExecutionLogLines));
    }

    const status = persisted.lastJobStatus?.status;
    const isTerminal = status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED';

    // If restored state indicates we're still running, reopen SSE.
    if (!isTerminal) {
      jobGenerationRef.current += 1;
      const generation = jobGenerationRef.current;
      setEventLogs((prev) => {
        const updated = [...prev, `[client] Restored active job from session: ${normalizedJobId}. Reconnecting...`];
        return updated.slice(-scriptRunnerConfig.maxExecutionLogLines);
      });

      window.setTimeout(() => {
        streamJobEventsRef.current?.(normalizedJobId, generation);
      }, 0);
    }

    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a small tail of logs and the latest status so a refresh can resume.
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
  }, [eventLogs, lastJobStatus, reconnectCount, lastCommand, lastLabel, scriptRunnerConfig.maxExecutionLogLines]);

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

      const effectiveLabel = label ?? 'Free Text Command';
      setLastLabel(effectiveLabel);
      setLastCommand(command);

      appendLog(`[client] Starting command: ${command}`);

      try {
        const res = await fetch('/api/orchestrator/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, label: effectiveLabel, tabId, runId }),
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          const status = res.status;

          if (status === 503) {
            appendLog(`[client] Orchestrator rejected job submit as busy (503).`);
            appendLog(bodyText ? `[client] ${bodyText}` : '[client] Try again once the active job completes.');
            setLastJobStatus({
              jobId: 'N/A',
              status: 'FAILED',
              finishedAt: new Date().toISOString(),
              lastLine: `Orchestrator busy (HTTP 503).`,
              title: effectiveLabel,
            });
            return { ok: false, job: null, output: `HTTP ${status} - ${bodyText}` };
          }

          appendLog(`[client] Submit failed: HTTP ${status}${bodyText ? ` - ${bodyText}` : ''}`);
          setLastJobStatus({
            jobId: 'N/A',
            status: 'FAILED',
            finishedAt: new Date().toISOString(),
            lastLine: `Submit failed (HTTP ${status}).`,
            title: effectiveLabel,
          });
          return { ok: false, job: null, output: `HTTP ${status} - ${bodyText}` };
        }

        const json = (await res.json().catch(() => null)) as null | { jobId?: string; requestId?: string };
        const normalizedJobId = normalizeJobId(json?.jobId);
        if (!normalizedJobId) {
          return { ok: false, job: null, output: `Invalid jobId from orchestrator: ${String(json?.jobId)}` };
        }

        runningJobIdRef.current = normalizedJobId;
        setCurrentJobId(normalizedJobId);

        // Persist immediately.
        writePersistedState({
          jobId: normalizedJobId,
          runId,
          lastCommand: command,
          lastLabel: effectiveLabel,
          reconnectCount: 0,
          lastJobStatus: { jobId: normalizedJobId, status: 'QUEUED', title: effectiveLabel },
          eventLogsTail: [`[client] Starting command: ${command}`],
          savedAtMs: Date.now(),
        });

        setLastJobStatus(() => ({ jobId: normalizedJobId, status: 'QUEUED', title: effectiveLabel }));
        streamJobEvents(normalizedJobId, generation);

        const ridTxt = typeof json?.requestId === 'string' ? ` rid=${json.requestId}` : '';
        return {
          ok: true,
          job: { jobId: normalizedJobId, status: 'QUEUED', title: effectiveLabel },
          output: `Job ID: ${normalizedJobId}${ridTxt}`,
        };
      } catch (err) {
        return { ok: false, job: null, output: String(err) };
      } finally {
        setExecuting(false);
      }
    },
    [appendLog, clearEventLogs, streamJobEvents]
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
