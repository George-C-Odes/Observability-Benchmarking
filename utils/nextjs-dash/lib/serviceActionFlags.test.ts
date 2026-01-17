import { describe, expect, it, afterEach } from 'vitest';

import { isServiceActionsEnabled, resolveServiceActionFlags } from './serviceActionFlags';

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const k of keys) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: EnvSnapshot) {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('serviceActionFlags', () => {
  const keys = ['SERVICE_ACTIONS_ENABLE_ALL', 'ALLOY_ACTIONS_ENABLE', 'GRAFANA_ACTIONS_ENABLE', 'GO_ACTIONS_ENABLE'];

  const original = snapshotEnv(keys);

  afterEach(() => {
    restoreEnv(original);
  });

  it('defaults: OBS core enabled, non-OBS disabled', () => {
    delete process.env.SERVICE_ACTIONS_ENABLE_ALL;
    delete process.env.GO_ACTIONS_ENABLE;

    expect(isServiceActionsEnabled('grafana')).toBe(true);
    expect(isServiceActionsEnabled('go')).toBe(false);

    expect(resolveServiceActionFlags('grafana')).toEqual({
      start: true,
      restart: true,
      stop: true,
      recreate: true,
      delete: true,
    });

    expect(resolveServiceActionFlags('go')).toEqual({
      start: false,
      restart: false,
      stop: false,
      recreate: false,
      delete: false,
    });
  });

  it('global enable-all overrides defaults', () => {
    process.env.SERVICE_ACTIONS_ENABLE_ALL = 'true';

    expect(isServiceActionsEnabled('go')).toBe(true);
    expect(isServiceActionsEnabled('wrk2')).toBe(true);
  });

  it('per-service env var overrides defaults', () => {
    delete process.env.SERVICE_ACTIONS_ENABLE_ALL;

    process.env.GO_ACTIONS_ENABLE = 'true';
    expect(isServiceActionsEnabled('go')).toBe(true);

    process.env.ALLOY_ACTIONS_ENABLE = 'false';
    expect(isServiceActionsEnabled('alloy')).toBe(false);
  });
});
