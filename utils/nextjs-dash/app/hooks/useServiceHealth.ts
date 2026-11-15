'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useServiceActionsConfig } from './useServiceActionsConfig';
import { useTimedPulse } from './useTimedPulse';
import {
  toPending,
  byName,
  countByStatus,
  formatRelativeSince,
  formatExactTime,
  type ServiceHealth,
  type ServiceMessage,
} from '@/lib/serviceHealthModel';
import { serviceHealthClient, type ServiceHealthClient } from '@/lib/serviceHealthClient';
export function useServiceHealth(client: ServiceHealthClient = serviceHealthClient) {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const requestVersionRef = useRef(0);
  const allRequestVersionRef = useRef(0);
  const serviceRequestVersionsRef = useRef(new Map<string, number>());
  const pendingRefreshesRef = useRef(new Map<string, number>());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<ServiceMessage | null>(null);

  const serviceActionsCfg = useServiceActionsConfig();

  const statusCounts = useMemo(() => countByStatus(services), [services]);
  const countsPulseKey = useMemo(
    () => `${statusCounts.up}-${statusCounts.down}-${statusCounts.pending}-${statusCounts.total}`,
    [statusCounts.up, statusCounts.down, statusCounts.pending, statusCounts.total],
  );
  const { on: countsPulseOn } = useTimedPulse({
    durationMs: 700,
    trigger: countsPulseKey,
    allowFalsy: true,
  });

  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const updatedFlashTrigger = lastUpdatedAt?.toISOString() ?? null;
  const { on: updatedFlashOn } = useTimedPulse({
    durationMs: 900,
    trigger: updatedFlashTrigger,
    allowFalsy: true,
  });

  useEffect(() => {
    if (!lastUpdatedAt) return;

    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [lastUpdatedAt]);

  const markUpdated = useCallback(() => {
    const updatedAt = new Date();
    setLastUpdatedAt(updatedAt);
    setNowMs(updatedAt.getTime());
  }, []);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return '—';

    const thenMs = lastUpdatedAt.getTime();
    const currentNowMs = Math.max(thenMs, nowMs ?? thenMs);
    const deltaMs = Math.max(0, currentNowMs - thenMs);

    // When older than a day, show explicit date+time.
    if (deltaMs >= 24 * 60 * 60_000) {
      return lastUpdatedAt.toLocaleString();
    }

    const rel = formatRelativeSince(currentNowMs, thenMs);
    const exact = formatExactTime(lastUpdatedAt);
    return `${rel} · ${exact}`;
  }, [lastUpdatedAt, nowMs]);

  const applyAllServices = useCallback(
    (nextServices: ServiceHealth[], version: number) => {
      if (allRequestVersionRef.current !== version) return;
      setServices((previous) => {
        // Preserve services with a newer individual request, even if omitted by this list.
        const hasNewerRead = (name: string) =>
          (serviceRequestVersionsRef.current.get(name) ?? 0) > version;
        return [
          ...nextServices.filter((service) => !hasNewerRead(service.name)),
          ...previous.filter((service) => hasNewerRead(service.name)),
        ].sort(byName);
      });
      markUpdated();
    },
    [markUpdated],
  );

  const fetchAllServices = useCallback(async () => {
    const version = ++requestVersionRef.current;
    allRequestVersionRef.current = version;
    setLoading(true);
    setMessage(null);
    try {
      applyAllServices(await client.readAll(), version);
    } catch {
      if (allRequestVersionRef.current !== version) return;
      setMessage({
        type: 'error',
        text: 'Failed to check service health (dashboard backend unreachable)',
      });
    } finally {
      if (allRequestVersionRef.current === version) setLoading(false);
    }
  }, [applyAllServices, client]);

  const refreshService = useCallback(
    async (serviceName: string) => {
      const version = ++requestVersionRef.current;
      serviceRequestVersionsRef.current.set(serviceName, version);
      pendingRefreshesRef.current.set(
        serviceName,
        (pendingRefreshesRef.current.get(serviceName) ?? 0) + 1,
      );
      setRefreshing((previous) => new Set(previous).add(serviceName));
      try {
        const single = await client.readOne(serviceName);

        if (
          single &&
          allRequestVersionRef.current < version &&
          serviceRequestVersionsRef.current.get(serviceName) === version
        ) {
          setServices((prev) =>
            prev.map((s) => (s.name === serviceName ? single : s)).sort(byName),
          );
          markUpdated();
        }
      } catch {
        // ignore
      } finally {
        const remaining = (pendingRefreshesRef.current.get(serviceName) ?? 1) - 1;
        if (remaining > 0) {
          pendingRefreshesRef.current.set(serviceName, remaining);
        } else {
          pendingRefreshesRef.current.delete(serviceName);
          setRefreshing((previous) => {
            const next = new Set(previous);
            next.delete(serviceName);
            return next;
          });
        }
      }
    },
    [markUpdated, client],
  );

  const submitDockerControl = useCallback(
    async (
      serviceName: string,
      payload: {
        service: string;
        action: 'start' | 'stop' | 'restart' | 'recreate' | 'delete';
      },
      optimisticActionLabel: string,
    ) => {
      setSubmitting(serviceName);
      setServices((prev) => prev.map((s) => (s.name === serviceName ? toPending(s) : s)));
      markUpdated();

      try {
        await client.submitAction(payload);

        setMessage({
          type: 'success',
          text: `Submitted ${optimisticActionLabel} for ${serviceName}. Status will update after refresh.`,
          service: serviceName,
        });
      } catch {
        setMessage({
          type: 'error',
          text: `Failed to submit ${optimisticActionLabel} for ${serviceName}.`,
          service: serviceName,
        });
        void refreshService(serviceName);
      } finally {
        setSubmitting(null);
      }
    },
    [markUpdated, refreshService, client],
  );

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersionRef.current;
    allRequestVersionRef.current = version;

    const loadInitialServices = async () => {
      try {
        const nextServices = await client.readAll();
        if (cancelled) return;

        applyAllServices(nextServices, version);
      } catch {
        if (cancelled || allRequestVersionRef.current !== version) return;
        setMessage({
          type: 'error',
          text: 'Failed to check service health (dashboard backend unreachable)',
        });
      } finally {
        if (!cancelled && allRequestVersionRef.current === version) {
          setLoading(false);
        }
      }
    };

    void loadInitialServices();

    return () => {
      cancelled = true;
    };
  }, [applyAllServices, client]);

  const groupedServices = useMemo(() => {
    const observability = services
      .filter((s) => ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(s.name))
      .sort(byName);
    const spring = services.filter((s) => s.name.startsWith('spring-')).sort(byName);
    const quarkus = services.filter((s) => s.name.startsWith('quarkus-')).sort(byName);
    const micronaut = services.filter((s) => s.name.startsWith('micronaut-')).sort(byName);
    const helidon = services.filter((s) => s.name.startsWith('helidon-')).sort(byName);
    const spark = services.filter((s) => s.name.startsWith('spark-')).sort(byName);
    const javalin = services.filter((s) => s.name.startsWith('javalin-')).sort(byName);
    const dropwizard = services.filter((s) => s.name.startsWith('dropwizard-')).sort(byName);
    const vertx = services.filter((s) => s.name.startsWith('vertx-')).sort(byName);
    const pekko = services.filter((s) => s.name.startsWith('pekko-')).sort(byName);
    const go = services.filter((s) => s.name.startsWith('go')).sort(byName);
    const django = services.filter((s) => s.name.startsWith('django-')).sort(byName);
    const utils = services
      .filter((s) => ['nextjs-dash', 'orchestrator', 'wrk2'].includes(s.name))
      .sort(byName);

    return {
      observability,
      spring,
      quarkus,
      micronaut,
      helidon,
      spark,
      javalin,
      dropwizard,
      vertx,
      pekko,
      go,
      django,
      utils,
    };
  }, [services]);

  const dismissMessage = useCallback(() => setMessage(null), []);

  return {
    dismissMessage,
    lastUpdatedAt,
    countsPulseKey,
    loading,
    refreshing,
    submitting,
    message,
    serviceActionsCfg,
    statusCounts,
    countsPulseOn,
    updatedFlashOn,
    lastUpdatedText,
    fetchAllServices,
    refreshService,
    submitDockerControl,
    groupedServices,
  };
}
