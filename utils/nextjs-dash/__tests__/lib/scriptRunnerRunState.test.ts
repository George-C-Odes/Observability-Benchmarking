import { describe, expect, it, beforeEach } from 'vitest';
import { setActiveRunId, getActiveRunId } from '@/lib/scriptRunnerRunState';

describe('scriptRunnerRunState', () => {
  beforeEach(() => {
    setActiveRunId(null);
  });

  it('starts as null', () => {
    expect(getActiveRunId()).toBeNull();
  });

  it('stores and retrieves a run id', () => {
    setActiveRunId('run-42');
    expect(getActiveRunId()).toBe('run-42');
  });

  it('can be cleared back to null', () => {
    setActiveRunId('run-42');
    setActiveRunId(null);
    expect(getActiveRunId()).toBeNull();
  });

  it('overwrites with a new run id', () => {
    setActiveRunId('run-1');
    setActiveRunId('run-2');
    expect(getActiveRunId()).toBe('run-2');
  });
});