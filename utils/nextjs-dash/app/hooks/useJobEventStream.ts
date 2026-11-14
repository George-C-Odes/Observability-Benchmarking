'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { JobStatus } from '@/lib/jobRunner/model';
import { classifyMetaFailure, getNextJobStatus } from '@/lib/jobRunner/model';
import { processSseEvent } from '@/lib/jobRunner/events';
import { computeReconnectDelay } from '@/lib/jobRunner/random';
import { writePersistedState } from '@/lib/jobRunner/storage';
import type { JobTransport } from '@/lib/jobRunner/transport';
import { createClientLogger } from '@/lib/clientLogger';

type StreamOptions = {
  transport: JobTransport;
  timeoutMs: number;
  initialReconnectCount: number;
  lastLabel: string | null;
  appendLog: (line: string) => void;
  runningJobIdRef: RefObject<string | null>;
  jobGenerationRef: RefObject<number>;
  runIdRef: RefObject<string | null>;
  setLastJobStatus: Dispatch<SetStateAction<JobStatus | null>>;
};
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
      runningJobIdRef.current,
      terminalAppliedByJobRef.current.has(jobId),
    ),
  );
}

export function useJobEventStream({
  transport,
  timeoutMs,
  initialReconnectCount,
  lastLabel,
  appendLog,
  runningJobIdRef,
  jobGenerationRef,
  runIdRef,
  setLastJobStatus,
}: StreamOptions) {
  const [reconnectCount, setReconnectCount] = useState(initialReconnectCount);
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

  const clientLogger = useMemo(() => createClientLogger('useJobRunner'), []);
  const terminalAppliedByJobRef = useRef<Set<string>>(new Set());
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

  useEffect(
    () => () => {
      clearTimers();
      expectedSseCloseRef.current = true;
      eventSourceRef.current?.close();
    },
    [clearTimers],
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
    [appendLog, closeEventSource, lastLabel, runningJobIdRef, setLastJobStatus],
  );

  const handleStreamError = useCallback(
    async (jobId: string, generation: number) => {
      const meta = await transport.checkStreamMeta(jobId, runIdRef.current);
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
    [appendLog, markTerminalFailed, transport, jobGenerationRef, runIdRef],
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

          const { source: es, url: esUrl } = transport.openEventStream(jobId, runId, Date.now());
          appendLog(`[client] Opening event stream: ${esUrl}`);
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
              `[client] Event stream timed out after ${timeoutMs}ms (no connection established)`,
            );
            closeEventSource();
          }
        }, timeoutMs);
      } catch {
        setSseLastError('Failed to open SSE');
        appendLog('[client] Failed to open orchestrator event stream.');
      }
    },
    [
      transport,
      appendLog,
      clearTimers,
      closeEventSource,
      lastLabel,
      clientLogger,
      handleStreamError,
      timeoutMs,
      jobGenerationRef,
      runIdRef,
      runningJobIdRef,
      setLastJobStatus,
    ],
  );

  const prepareRun = useCallback(() => {
    setReconnectCount(0);
    setSseLastError(null);
  }, []);
  const resetStream = useCallback(() => {
    closeEventSource();
    activeSseJobIdRef.current = null;
    terminalAppliedByJobRef.current.clear();
    prepareRun();
    sseLastRequestIdRef.current = null;
    sseConnectStartedAtRef.current = null;
  }, [closeEventSource, prepareRun]);
  return { streamJobEvents, resetStream, prepareRun, sseConnected, sseLastError, reconnectCount };
}
