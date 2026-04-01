import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimedPulse } from '@/app/hooks/useTimedPulse';

describe('useTimedPulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with on=false', () => {
    const { result } = renderHook(() =>
      useTimedPulse({ durationMs: 500 }),
    );
    expect(result.current.on).toBe(false);
  });

  it('fire() turns on then off after durationMs', () => {
    const { result } = renderHook(() =>
      useTimedPulse({ durationMs: 500 }),
    );

    act(() => {
      result.current.fire();
    });

    // The fire() uses setTimeout(…, 0) to turn on.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.on).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.on).toBe(false);
  });

  it('pulses when trigger changes (truthy value)', () => {
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: unknown }) =>
        useTimedPulse({ durationMs: 300, trigger }),
      { initialProps: { trigger: 'a' as unknown } },
    );

    // Initial render — trigger hasn't "changed" yet.
    expect(result.current.on).toBe(false);

    // Change trigger → should fire.
    rerender({ trigger: 'b' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.on).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.on).toBe(false);
  });

  it('does not pulse when trigger changes to falsy (without allowFalsy)', () => {
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: unknown }) =>
        useTimedPulse({ durationMs: 300, trigger }),
      { initialProps: { trigger: 'a' as unknown } },
    );

    rerender({ trigger: '' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.on).toBe(false);
  });

  it('pulses on falsy trigger when allowFalsy is true', () => {
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: unknown }) =>
        useTimedPulse({ durationMs: 300, trigger, allowFalsy: true }),
      { initialProps: { trigger: 'a' as unknown } },
    );

    rerender({ trigger: '' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.on).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.on).toBe(false);
  });

  it('does not pulse when trigger stays the same', () => {
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: unknown }) =>
        useTimedPulse({ durationMs: 300, trigger }),
      { initialProps: { trigger: 'same' as unknown } },
    );

    rerender({ trigger: 'same' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.on).toBe(false);
  });
});