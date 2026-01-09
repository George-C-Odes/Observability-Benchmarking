'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type JobStatus = {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastLine?: string;
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
  runCommand: (command: string, label?: string) => Promise<RunResult>;
};

const MAX_EVENT_LOGS = 500;

export function useJobRunner(): UseJobRunnerState {
  const [executing, setExecuting] = useState(false);
  const [eventLogs, setEventLogs] = useState<string[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const expectedSseCloseRef = useRef(false);
  const activeSseJobIdRef = useRef<string | null>(null);

  const closeEventSource = useCallback(() => {
    expectedSseCloseRef.current = true;
    activeSseJobIdRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const clearEventLogs = useCallback(() => {
    setEventLogs([]);
  }, []);

  const streamJobEvents = useCallback(
    (jobId: string) => {
      try {
        closeEventSource();
        expectedSseCloseRef.current = false;
        activeSseJobIdRef.current = jobId;

        const es = new EventSource(`/api/orchestrator/events?jobId=${encodeURIComponent(jobId)}`);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          const logLine = event.data;
          setEventLogs((prev) => {
            const updated = [...prev, logLine];
            return updated.slice(-MAX_EVENT_LOGS);
          });
        };

        es.onerror = () => {
          const isExpected = expectedSseCloseRef.current || activeSseJobIdRef.current !== jobId;
          closeEventSource();
          if (!isExpected) {
            setEventLogs((prev) => [...prev, '[client] Lost connection to orchestrator event stream.']);
          }
        };

        window.setTimeout(() => {
          closeEventSource();
        }, 600000);
      } catch (e) {
        setEventLogs((prev) => [...prev, '[client] Failed to open orchestrator event stream.']);
        console.error('Failed to stream job events:', e);
      }
    },
    [closeEventSource]
  );

  const pollJobStatus = useCallback(
    async (jobId: string): Promise<JobStatus | null> => {
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          const statusResponse = await fetch(`/api/orchestrator/status?jobId=${encodeURIComponent(jobId)}`);
          const status = (await statusResponse.json()) as JobStatus;

          if (status.status === 'SUCCEEDED' || status.status === 'FAILED' || status.status === 'CANCELED') {
            if (activeSseJobIdRef.current === jobId) {
              expectedSseCloseRef.current = true;
              activeSseJobIdRef.current = null;
            }
            return status;
          }
        } catch (e) {
          console.error('Error polling job status:', e);
        }
      }
      return null;
    },
    []
  );

  const runCommand = useCallback(
    async (command: string, label?: string): Promise<RunResult> => {
      setExecuting(true);
      setEventLogs([]);

      closeEventSource();
      expectedSseCloseRef.current = false;
      activeSseJobIdRef.current = null;

      try {
        const submitResponse = await fetch(`/api/orchestrator/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ command }),
        });

        const submitData = (await submitResponse.json().catch(() => ({}))) as {
          jobId?: string;
          error?: string;
          details?: string;
        };

        if (!submitResponse.ok) {
          const details = typeof submitData?.details === 'string' ? ` (${submitData.details})` : '';
          const msg = typeof submitData?.error === 'string' ? `${submitData.error}${details}` : 'Failed to submit command';
          return { ok: false, job: null, output: msg };
        }

        const jobId = submitData.jobId;
        if (!jobId) {
          return { ok: false, job: null, output: 'No jobId returned from orchestrator' };
        }

        console.log(`Job submitted${label ? ` (${label})` : ''} with ID: ${jobId}`);
        streamJobEvents(jobId);

        const finalStatus = await pollJobStatus(jobId);

        expectedSseCloseRef.current = true;
        activeSseJobIdRef.current = null;
        closeEventSource();

        const formatted = formatFinalStatus(finalStatus);
        return { ok: finalStatus?.status === 'SUCCEEDED', job: finalStatus, output: formatted };
      } catch (e) {
        closeEventSource();
        const errorMessage = e instanceof Error ? e.message : 'Failed to execute command (orchestrator unreachable)';
        return { ok: false, job: null, output: errorMessage };
      } finally {
        setExecuting(false);
      }
    },
    [closeEventSource, pollJobStatus, streamJobEvents]
  );

  useEffect(() => {
    return () => closeEventSource();
  }, [closeEventSource]);

  return { executing, eventLogs, clearEventLogs, runCommand };
}

function formatFinalStatus(finalStatus: JobStatus | null): string {
  let out = '';
  if (finalStatus) {
    const startedAt = finalStatus.startedAt ?? '';
    const finishedAt = finalStatus.finishedAt ?? '';

    const startTime = startedAt ? new Date(startedAt) : null;
    const endTime = finishedAt ? new Date(finishedAt) : null;
    const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;
    const durationSec = durationMs !== null ? (durationMs / 1000).toFixed(2) : 'N/A';

    out += `Job ID: ${finalStatus.jobId}\n`;
    out += `Status: ${finalStatus.status}\n`;
    out += `Exit Code: ${finalStatus.exitCode}\n`;
    out += `Duration: ${durationSec}s\n`;
    out += `Started: ${startTime ? startTime.toLocaleString() : 'N/A'}\n`;
    out += `Finished: ${endTime ? endTime.toLocaleString() : 'N/A'}\n\n`;

    if (finalStatus.lastLine) {
      out += `Last Output Line:\n${finalStatus.lastLine}\n\n`;
    }
  }

  out += 'Check the event logs below for full execution output';
  return out;
}
