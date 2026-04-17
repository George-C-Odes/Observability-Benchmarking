'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  Divider,
  Paper,
  Tooltip,
  Fade,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import { createClientLogger } from '@/lib/clientLogger';
import { InwardPulse } from '@/app/components/ui/InwardPulse';
import { useTimedPulse } from '@/app/hooks/useTimedPulse';

const clientLogger = createClientLogger('BenchmarkTargets');

/**
 * The master list of all known benchmark endpoints.
 * This is the superset; the targets file is a subset of these.
 */
const ALL_ENDPOINTS: readonly string[] = [
  'http://spring-jvm-tomcat-platform:8080/hello/platform',
  'http://spring-jvm-tomcat-virtual:8080/hello/virtual',
  'http://spring-jvm-netty:8080/hello/reactive',
  'http://spring-native-tomcat-platform:8080/hello/platform',
  'http://spring-native-tomcat-virtual:8080/hello/virtual',
  'http://spring-native-netty:8080/hello/reactive',
  'http://quarkus-jvm:8080/hello/platform',
  'http://quarkus-jvm:8080/hello/virtual',
  'http://quarkus-jvm:8080/hello/reactive',
  'http://quarkus-native:8080/hello/platform',
  'http://quarkus-native:8080/hello/virtual',
  'http://quarkus-native:8080/hello/reactive',
  'http://micronaut-jvm:8080/hello/platform',
  'http://micronaut-jvm:8080/hello/virtual',
  'http://micronaut-jvm:8080/hello/reactive',
  'http://micronaut-native:8080/hello/platform',
  'http://micronaut-native:8080/hello/virtual',
  'http://micronaut-native:8080/hello/reactive',
  'http://helidon-se-jvm:8080/hello/virtual',
  'http://helidon-se-native:8080/hello/virtual',
  'http://helidon-mp-jvm:8080/hello/virtual',
  'http://helidon-mp-native:8080/hello/virtual',
  'http://spark-jvm-platform:8080/hello/platform',
  'http://spark-jvm-virtual:8080/hello/virtual',
  'http://javalin-jvm-platform:8080/hello/platform',
  'http://javalin-jvm-virtual:8080/hello/virtual',
  'http://dropwizard-jvm-platform:8080/hello/platform',
  'http://dropwizard-jvm-virtual:8080/hello/virtual',
  'http://vertx-jvm:8080/hello/reactive',
  'http://pekko-jvm:8080/hello/reactive',
  'http://go:8080/hello/virtual',
  'http://django-platform:8080/hello/platform',
  'http://django-reactive:8080/hello/reactive',
] as const;

/**
 * Badge hex colors taken directly from the shields.io badges in README.template.md.
 * These are the source-of-truth colors used for both filter-group chips and
 * endpoint chips so the dashboard matches the README badges exactly.
 */
const BADGE_COLORS = {
  java:       '#ED8B00',
  spring:     '#6DB33F',
  quarkus:    '#6C63FF',
  micronaut:  '#1A1A2E',
  helidon:    '#008F6B',
  spark:      '#FF7043',
  javalin:    '#00AFCF',
  dropwizard: '#C9A200',
  vertx:      '#782A90',
  pekko:      '#DB2777',
  go:         '#38BDF8',
  python:     '#2F5D8C',
  django:     '#8B2C3D',
} as const;

/** Quick-filter group definitions */
interface FilterGroup {
  label: string;
  /** Predicate to test if an endpoint URL belongs to this group */
  match: (url: string) => boolean;
  /** MUI color token – used only when `badgeHex` is not set */
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error';
  /** Exact hex color from the README badge.  When set, chip color is driven
   *  entirely via sx overrides so it matches the badge precisely. */
  badgeHex?: string;
}

/** A labeled row of quick-filter chips shown in the filter panel. */
interface FilterRow {
  label: string;
  groups: readonly FilterGroup[];
}

/** Subgroup inside a framework endpoint group (e.g., JVM / Native). */
interface EndpointSubgroup {
  label: string;
  urls: string[];
}

/** A visual framework group of endpoint chips, with optional JVM/Native subgroups. */
interface EndpointGroup {
  label: string;
  urls: string[];
  subgroups?: EndpointSubgroup[];
}

const FILTER_ROWS: readonly FilterRow[] = [
  {
    label: 'Language',
    groups: [
      { label: 'All',    match: () => true,  color: 'primary' },
      { label: 'None',   match: () => false, color: 'default' },
      { label: 'Java',   match: (u) => !u.includes('go:') && !u.includes('django'), badgeHex: BADGE_COLORS.java },
      { label: 'Go',     match: (u) => u.includes('go:'),    badgeHex: BADGE_COLORS.go },
      { label: 'Python', match: (u) => u.includes('django'), badgeHex: BADGE_COLORS.python },
    ],
  },
  {
    label: 'Framework',
    groups: [
      { label: 'Spring',     match: (u) => u.includes('spring'),     badgeHex: BADGE_COLORS.spring },
      { label: 'Quarkus',    match: (u) => u.includes('quarkus'),    badgeHex: BADGE_COLORS.quarkus },
      { label: 'Micronaut',  match: (u) => u.includes('micronaut'),  badgeHex: BADGE_COLORS.micronaut },
      { label: 'Helidon',    match: (u) => u.includes('helidon'),    badgeHex: BADGE_COLORS.helidon },
      { label: 'Spark',      match: (u) => u.includes('spark'),      badgeHex: BADGE_COLORS.spark },
      { label: 'Javalin',    match: (u) => u.includes('javalin'),    badgeHex: BADGE_COLORS.javalin },
      { label: 'Dropwizard', match: (u) => u.includes('dropwizard'), badgeHex: BADGE_COLORS.dropwizard },
      { label: 'Vert.x',     match: (u) => u.includes('vertx'),     badgeHex: BADGE_COLORS.vertx },
      { label: 'Pekko',      match: (u) => u.includes('pekko'),     badgeHex: BADGE_COLORS.pekko },
      { label: 'Django',     match: (u) => u.includes('django'),     badgeHex: BADGE_COLORS.django },
    ],
  },
  {
    label: 'Runtime',
    groups: [
      { label: 'JVM',     match: (u) => u.includes('-jvm'),    color: 'info' },
      { label: 'Native',  match: (u) => u.includes('-native'), color: 'warning' },
      { label: 'CPython', match: (u) => u.includes('django'),  badgeHex: BADGE_COLORS.python },
    ],
  },
  {
    label: 'Endpoint',
    groups: [
      { label: 'Platform', match: (u) => u.endsWith('/platform'), color: 'info' },
      { label: 'Virtual',  match: (u) => u.endsWith('/virtual'),  color: 'info' },
      { label: 'Reactive', match: (u) => u.endsWith('/reactive'), color: 'info' },
    ],
  },
];

/**
 * Extract a human-readable short label from a full URL.
 * e.g. "http://spring-jvm-tomcat-platform:8080/hello/platform" → "spring-jvm-tomcat-platform / platform"
 */
function urlToLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const pathParts = u.pathname.split('/').filter(Boolean);
    const endpoint = pathParts[pathParts.length - 1] ?? '';
    return `${host} / ${endpoint}`;
  } catch {
    return url;
  }
}

/**
 * Extract just the host portion for grouping.
 * e.g. "http://spring-jvm-tomcat-platform:8080/hello/platform" → "spring-jvm-tomcat-platform"
 */
function urlToHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Resolve the README badge hex color for an endpoint URL.
 */
function endpointBadgeHex(url: string): string | undefined {
  if (url.includes('spring'))     return BADGE_COLORS.spring;
  if (url.includes('quarkus'))    return BADGE_COLORS.quarkus;
  if (url.includes('micronaut'))  return BADGE_COLORS.micronaut;
  if (url.includes('helidon'))    return BADGE_COLORS.helidon;
  if (url.includes('spark'))      return BADGE_COLORS.spark;
  if (url.includes('javalin'))    return BADGE_COLORS.javalin;
  if (url.includes('dropwizard')) return BADGE_COLORS.dropwizard;
  if (url.includes('vertx'))      return BADGE_COLORS.vertx;
  if (url.includes('pekko'))      return BADGE_COLORS.pekko;
  if (url.includes('go:'))        return BADGE_COLORS.go;
  if (url.includes('django'))     return BADGE_COLORS.django;
  return undefined;
}

/**
 * Build sx color overrides for a chip driven by an exact hex badge color.
 * When `hex` is undefined the caller should fall back to the MUI `color` prop.
 */
function badgeChipSx(
  hex: string | undefined,
  active: boolean,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const hoverExtra = (extra?.['&:hover'] ?? {}) as Record<string, unknown>;

  if (!hex) {
    return { '&:hover': { ...hoverExtra } };
  }
  if (active) {
    return {
      backgroundColor: hex,
      color: '#fff',
      borderColor: hex,
      '&:hover': { ...hoverExtra, backgroundColor: hex, filter: 'brightness(0.85)' },
    };
  }
  return {
    borderColor: hex,
    color: hex,
    '&:hover': { ...hoverExtra, backgroundColor: `${hex}14` },
  };
}

async function readBenchmarkTargets(): Promise<Set<string>> {
  const response = await fetch('/api/benchmark-targets', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load benchmark targets (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { urls?: string[] };
  return new Set(data.urls ?? []);
}

export default function BenchmarkTargets() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { on: savePulseOn } = useTimedPulse({ durationMs: 800, trigger: saving, allowFalsy: true });

  /** Tracks the persisted set so we can compare for dirty state */
  const [persistedUrls, setPersistedUrls] = useState<Set<string>>(new Set());

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const urlSet = await readBenchmarkTargets();
      setSelected(new Set(urlSet));
      setPersistedUrls(new Set(urlSet));
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load benchmark targets' });
      clientLogger.error('Failed to load benchmark targets', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialTargets = async () => {
      try {
        const urlSet = await readBenchmarkTargets();
        if (cancelled) return;

        setSelected(new Set(urlSet));
        setPersistedUrls(new Set(urlSet));
      } catch (error) {
        if (cancelled) return;
        setMessage({ type: 'error', text: 'Failed to load benchmark targets' });
        clientLogger.error('Failed to load benchmark targets', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialTargets();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }, []);

  const handleGroupFilter = useCallback((group: FilterGroup) => {
    if (group.label === 'All') {
      setSelected(new Set(ALL_ENDPOINTS));
    } else if (group.label === 'None') {
      setSelected(new Set());
    } else {
      // Toggle group: if all matching are selected, deselect them; otherwise select them
      const matching = ALL_ENDPOINTS.filter(group.match);
      setSelected((prev) => {
        const next = new Set(prev);
        const allSelected = matching.every((u) => next.has(u));
        if (allSelected) {
          matching.forEach((u) => next.delete(u));
        } else {
          matching.forEach((u) => next.add(u));
        }
        return next;
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Preserve original ordering from ALL_ENDPOINTS
      const urls = ALL_ENDPOINTS.filter((u) => selected.has(u));

      const response = await fetch('/api/benchmark-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      if (!response.ok) {
        setMessage({ type: 'error', text: 'Failed to save benchmark targets' });
        return;
      }

      setPersistedUrls(new Set(urls));
      setMessage({ type: 'success', text: `Saved ${urls.length} benchmark target(s)` });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save benchmark targets' });
      clientLogger.error('Failed to save benchmark targets', error);
    } finally {
      setSaving(false);
    }
  }, [selected]);

  /** Compute dirty state from selected vs persisted state. */
  const dirty = useMemo(() => {
    if (loading) return false;

    const currentUrls = ALL_ENDPOINTS.filter((u) => selected.has(u));
    const persistedArr = ALL_ENDPOINTS.filter((u) => persistedUrls.has(u));

    return (
      currentUrls.length !== persistedArr.length ||
      currentUrls.some((u, i) => u !== persistedArr[i])
    );
  }, [selected, persistedUrls, loading]);

  /** Group endpoints by framework/service for visual organization */
  const groupedEndpoints = useMemo((): EndpointGroup[] => {
    const rawGroups: { label: string; urls: string[] }[] = [];
    let currentGroup: string[] = [];
    let currentLabel = '';

    for (const url of ALL_ENDPOINTS) {
      const host = urlToHost(url);
      // Group by the base service name (strip variant suffixes)
      const baseService = host
        .replace(/-jvm.*/, '')
        .replace(/-native.*/, '')
        .replace(/-se.*/, '')
        .replace(/-mp.*/, '')
        .replace(/-platform$/, '')
        .replace(/-reactive$/, '');

      if (baseService !== currentLabel && currentGroup.length > 0) {
        rawGroups.push({ label: currentLabel, urls: [...currentGroup] });
        currentGroup = [];
      }
      currentLabel = baseService;
      currentGroup.push(url);
    }
    if (currentGroup.length > 0) {
      rawGroups.push({ label: currentLabel, urls: currentGroup });
    }

    // Add JVM / Native subgroups for Java framework groups
    return rawGroups.map((group) => {
      const jvmUrls = group.urls.filter((u) => urlToHost(u).includes('-jvm'));
      const nativeUrls = group.urls.filter((u) => urlToHost(u).includes('-native'));

      // Non-Java groups (go, django) have no -jvm / -native → skip subgroups
      if (jvmUrls.length === 0 && nativeUrls.length === 0) return group;

      const subgroups: EndpointSubgroup[] = [];
      if (jvmUrls.length > 0) subgroups.push({ label: 'JVM', urls: jvmUrls });
      if (nativeUrls.length > 0) subgroups.push({ label: 'Native', urls: nativeUrls });
      return { ...group, subgroups };
    });
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
        <CircularProgress />
      </Box>
    );
  }

  /** Render a single endpoint chip (shared between flat and subgroup layouts). */
  const renderEndpointChip = (url: string) => {
    const isSelected = selected.has(url);
    const hex = endpointBadgeHex(url);
    return (
      <Tooltip key={url} title={url} arrow enterDelay={400}>
        <Chip
          label={urlToLabel(url)}
          size="medium"
          color={hex ? 'default' : (isSelected ? 'primary' : 'default')}
          variant={isSelected ? 'filled' : 'outlined'}
          onClick={() => handleToggle(url)}
          sx={{
            fontWeight: isSelected ? 600 : 400,
            opacity: isSelected ? 1 : 0.65,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...badgeChipSx(hex, isSelected, { '&:hover': { opacity: 1, transform: 'scale(1.04)' } }),
          }}
        />
      </Tooltip>
    );
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <TrackChangesIcon color="primary" />
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Benchmark Targets
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          {selected.size} / {ALL_ENDPOINTS.length} selected
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select which service endpoints to include in the benchmark run. Changes are saved to{' '}
        <code>config/benchmark-targets.txt</code> and take effect on the next wrk2 run.
      </Typography>

      {message && (
        <Fade in>
          <Alert
            severity={message.type}
            sx={{ mb: 2 }}
            onClose={() => setMessage(null)}
            icon={message.type === 'success' ? <CheckCircleOutlineIcon /> : undefined}
          >
            {message.text}
          </Alert>
        </Fade>
      )}

      {/* Quick-filter group buttons – organized into labeled rows */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Quick filters (toggle groups)
        </Typography>
        <Stack spacing={0.75}>
          {FILTER_ROWS.map((row) => (
            <Stack key={row.label} direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: 80, fontWeight: 600, flexShrink: 0 }}
              >
                {row.label}
              </Typography>
              {row.groups.map((group) => {
                const matching = ALL_ENDPOINTS.filter(group.match);
                const allSelected = matching.length > 0 && matching.every((u) => selected.has(u));
                return (
                  <Chip
                    key={group.label}
                    label={group.label}
                    size="small"
                    color={group.badgeHex ? 'default' : (allSelected ? (group.color ?? 'default') : 'default')}
                    variant={allSelected ? 'filled' : 'outlined'}
                    onClick={() => handleGroupFilter(group)}
                    sx={{
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      ...badgeChipSx(group.badgeHex, allSelected, { '&:hover': { transform: 'scale(1.05)' } }),
                    }}
                  />
                );
              })}
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* Endpoint chips organized by framework group */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        {groupedEndpoints.map((group) => (
          <Box key={group.label}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 0.75, textTransform: 'capitalize', fontWeight: 600, letterSpacing: 0.5 }}
            >
              {group.label}
            </Typography>
            {group.subgroups ? (
              <Stack spacing={1.25} sx={{ pl: 1.5, borderLeft: '2px solid', borderColor: 'divider' }}>
                {group.subgroups.map((sub) => (
                  <Box key={sub.label}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mb: 0.5, display: 'block', fontWeight: 600, letterSpacing: 0.5 }}
                    >
                      {sub.label}
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {sub.urls.map(renderEndpointChip)}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {group.urls.map(renderEndpointChip)}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Action buttons */}
      <Stack direction="row" spacing={2}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <InwardPulse active={savePulseOn} color="#1976d2" inset={8} borderRadius={8} durationMs={800} />
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !dirty}
            color={dirty ? 'primary' : 'inherit'}
          >
            {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </Button>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchTargets}
          disabled={loading}
        >
          Reload
        </Button>
      </Stack>
    </Box>
  );
}