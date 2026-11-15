'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useScriptRunnerConfig } from '@/app/hooks/useScriptRunnerConfig';

import { useJobEventStream } from './useJobEventStream';
import { getCryptoRandom } from '@/lib/jobRunner/random';

export type { JobStatus, RunResult } from '@/lib/jobRunner/model';
import type { JobStatus, RunResult } from '@/lib/jobRunner/model';
import { getRestoredJobState, writePersistedState } from '@/lib/jobRunner/storage';
import type { RestoredJobState } from '@/lib/jobRunner/storage';
import { browserJobTransport, type JobTransport } from '@/lib/jobRunner/transport';

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
export function useJobRunner(transport: JobTransport = browserJobTransport): UseJobRunnerState {
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
  const [lastCommand, setLastCommand] = useState<string | null>(
    () => restoredState?.lastCommand || null,
  );
  const [lastLabel, setLastLabel] = useState<string | null>(() => restoredState?.lastLabel || null);
  const tabIdRef = useRef<string>(makeTabId());
  const runningJobIdRef = useRef<string | null>(restoredState?.jobId || null);
  const jobGenerationRef = useRef(0);
  const runIdRef = useRef<string | null>(restoredState?.runId || null);

  const streamJobEventsRef = useRef<((jobId: string, generation: number) => void) | null>(null);

  const appendLog = useCallback(
    (line: string) => {
      setEventLogs((prev) => {
        const updated = [...prev, line];
        return updated.slice(-scriptRunnerConfig.maxExecutionLogLines);
      });
    },
    [scriptRunnerConfig.maxExecutionLogLines],
  );

  const { streamJobEvents, resetStream, prepareRun, sseConnected, sseLastError, reconnectCount } =
    useJobEventStream({
      transport,
      timeoutMs: scriptRunnerConfig.eventStreamTimeoutMs,
      initialReconnectCount: restoredState?.reconnectCount || 0,
      lastLabel,
      appendLog,
      runningJobIdRef,
      jobGenerationRef,
      runIdRef,
      setLastJobStatus,
    });

  const clearEventLogs = useCallback(() => {
    setEventLogs([]);
  }, []);

  const reset = useCallback(() => {
    resetStream();
    runningJobIdRef.current = null;
    runIdRef.current = null;
    jobGenerationRef.current += 1;
    setExecuting(false);
    setEventLogs([]);
    setCurrentJobId(null);
    setLastJobStatus(null);
    setLastCommand(null);
    setLastLabel(null);
    writePersistedState(null);
  }, [resetStream]);

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
      prepareRun();
      setLastJobStatus(null);

      const runId = makeRunId(tabId, generation);
      runIdRef.current = runId;

      const effectiveLabel = label || 'Free Text Command';
      setLastLabel(effectiveLabel);
      setLastCommand(command);

      appendLog(`[client] Starting command: ${command}`);

      try {
        const outcome = await transport.submitJobCommand(command, effectiveLabel, tabId, runId);
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
    [appendLog, clearEventLogs, handleFailedSubmit, handleSuccessfulSubmit, transport, prepareRun],
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
