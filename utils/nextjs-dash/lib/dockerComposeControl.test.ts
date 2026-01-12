import { describe, expect, it } from 'vitest';
import { buildDockerControlCommand } from './dockerComposeControl';

describe('dockerComposeControl', () => {
  it('adds OBS + SERVICES profiles for quarkus', () => {
    expect(buildDockerControlCommand({ service: 'quarkus-jvm', action: 'start' })).toBe(
      'docker compose --profile=OBS --profile=SERVICES up -d quarkus-jvm'
    );
  });

  it('uses rm -f -s for stopMode=delete', () => {
    expect(buildDockerControlCommand({ service: 'orchestrator', action: 'stop', stopMode: 'delete' })).toBe(
      'docker compose rm -f -s orchestrator'
    );
  });

  it('uses up -d --force-recreate for restartMode=recreate', () => {
    expect(buildDockerControlCommand({ service: 'tempo', action: 'restart', restartMode: 'recreate' })).toBe(
      'docker compose up -d --force-recreate tempo'
    );
  });

  it('keeps backward-compat: deleteContainer maps to stopMode=delete', () => {
    expect(buildDockerControlCommand({ service: 'orchestrator', action: 'stop', deleteContainer: true })).toBe(
      'docker compose rm -f -s orchestrator'
    );
  });

  it('keeps backward-compat: forceRecreate maps to restartMode=recreate', () => {
    expect(buildDockerControlCommand({ service: 'tempo', action: 'restart', forceRecreate: true })).toBe(
      'docker compose up -d --force-recreate tempo'
    );
  });
});
