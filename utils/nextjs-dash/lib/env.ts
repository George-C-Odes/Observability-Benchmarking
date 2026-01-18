/**
 * Small helpers for parsing environment variables.
 *
 * Notes:
 * - These are intentionally tiny and dependency-free.
 * - Use them on the server only; the browser should use runtime config endpoints.
 */

export function envNumber(name: string, defaultValue: number, opts?: { fallbackName?: string; min?: number }): number {
  const raw = process.env[name] ?? (opts?.fallbackName ? process.env[opts.fallbackName] : undefined);
  if (raw == null || raw === '') return defaultValue;

  const n = Number(raw);
  const min = opts?.min ?? 1;

  return Number.isFinite(n) && n >= min ? n : defaultValue;
}

export function envBool(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const v = raw.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'on';
}

export function envString(name: string, defaultValue: string, opts?: { fallbackName?: string }): string {
  const raw = process.env[name] ?? (opts?.fallbackName ? process.env[opts.fallbackName] : undefined);
  return raw == null || raw === '' ? defaultValue : raw;
}

