import { describe, expect, it } from 'vitest';
import { buildDockerControlCommand } from './dockerComposeControl';

describe('dockerComposeControl', () => {
  it('adds OBS + SERVICES profiles for quarkus', () => {
    expect(buildDockerControlCommand({ service: 'quarkus-jvm', action: 'start' })).toBe(
      'docker compose --profile=OBS --profile=SERVICES up -d quarkus-jvm'
    );
  });

  it('uses rm -f -s for delete', () => {
    expect(buildDockerControlCommand({ service: 'orchestrator', action: 'delete' })).toBe(
      'docker compose rm -f -s orchestrator'
    );
  });

  it('uses up -d --force-recreate for recreate', () => {
    expect(buildDockerControlCommand({ service: 'tempo', action: 'recreate' })).toBe(
      'docker compose up -d --force-recreate tempo'
    );
  });
});
