'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseTimedPulseOptions = {
  /** Turn the pulse on for this many ms. */
  durationMs: number;
  /** Optional dependency key; pulse triggers when this value changes (and is truthy unless allowFalsy=true). */
  trigger?: unknown;
  /** If true, also pulse on falsy trigger values when it changes. */
  allowFalsy?: boolean;
};

/**
 * Small utility hook to create a one-shot pulse boolean.
 *
 * - If `trigger` is provided, pulse when trigger changes.
 * - If `trigger` is omitted, you can call `fire()` manually.
 */
export function useTimedPulse(options: UseTimedPulseOptions) {
  const { durationMs, trigger, allowFalsy } = options;

  const [on, setOn] = useState(false);
  const prevRef = useRef<unknown>(trigger);

  const fire = useCallback(() => {
    const frame = window.setTimeout(() => setOn(true), 0);
    const t = window.setTimeout(() => setOn(false), durationMs);
    return () => {
      window.clearTimeout(frame);
      window.clearTimeout(t);
    };
  }, [durationMs]);

  useEffect(() => {
    if (typeof trigger === 'undefined') return;

    const prev = prevRef.current;
    const next = trigger;
    const changed = next !== prev;

    if (!changed) return;
    prevRef.current = next;

    if (!allowFalsy && !next) return;

    return fire();
  }, [trigger, allowFalsy, fire]);

  return { on, fire };
}
