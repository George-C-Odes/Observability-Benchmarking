import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { temporaryDirectory } from './test-helpers.mjs';

const frameworks = ['vertx', 'spring', 'spark', 'javalin', 'dropwizard', 'pekko'];
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/sh.exe' : '/bin/sh';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const pyro = 'verified profiling extension';
const agent = 'verified telemetry agent';
const pins = [];

for (const framework of frameworks) {
  let block;
  before(() => {
    const source = readFileSync(fileURLToPath(new URL(`../services/java/${framework}/jvm/Dockerfile`, import.meta.url)), 'utf8').replaceAll('\r\n', '\n');
    block = source.match(/RUN --mount=type=cache,id=otel-deps[^\n]*\n([\s\S]*?)(?=\n\n)/)?.[1];
    assert.ok(block, `${framework}: agent download RUN instruction`);
    pins.push(['OTEL_PYROSCOPE_SHA256', 'OTEL_JAVA_AGENT_SHA256'].map((key) => {
      const value = source.match(new RegExp(`^ARG ${key}=([a-f0-9]{64})$`, 'm'))?.[1];
      assert.ok(value, `${framework}: pinned ${key}`);
      return value;
    }));
  });

  function fixture(t, overrides = {}) {
    const directory = temporaryDirectory(t, 'java-agent-integrity-');
    mkdirSync(path.join(directory, 'cache'));
    const env = {
      ...process.env,
      OTEL_PYROSCOPE_VERSION: '2.1.4',
      OTEL_JAVA_AGENT_VERSION: '2.33.1',
      OTEL_PYROSCOPE_SHA256: digest(pyro),
      OTEL_JAVA_AGENT_SHA256: digest(agent),
      OTEL_JAVA_AGENT_URL: 'https://example.invalid/custom-agent.jar',
      ...overrides,
    };
    const cache = {
      pyro: `pyroscope-otel-javaagent-extension-2.1.4-${env.OTEL_PYROSCOPE_SHA256}.jar`,
      agent: `opentelemetry-javaagent-2.33.1-${env.OTEL_JAVA_AGENT_SHA256}.jar`,
    };
    // Execute the actual Dockerfile shell with a network-free curl at the client boundary.
    const script = `
      PATH=/usr/bin:/bin:$PATH
      curl() {
        printf '%s\\n' "$*" >> requests
        while [ "$1" != '-o' ]; do shift; done
        target=$2; url=$3
        case "$url" in
          *grafana/otel-profiling-java/*) printf '%s' '${pyro}' > "$target" ;;
          *) printf '%s' "\${TEST_AGENT_CONTENT:-${agent}}" > "$target" ;;
        esac
        if [ "\${TEST_INTERRUPT:-}" = 1 ]; then return 23; fi
      }
      ${block.replaceAll('\\\n', '\n').replaceAll('/cache/', './cache/')}
    `;
    return {
      directory, cache,
      seed(key, bytes) { writeFileSync(path.join(directory, 'cache', cache[key]), bytes); },
      run() {
        const result = spawnSync(shell, ['-c', script], { cwd: directory, env, encoding: 'utf8', timeout: 10_000 });
        assert.equal(result.error, undefined);
        assert.equal(result.signal, null);
        return result;
      },
      requests() { const file = path.join(directory, 'requests'); return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []; },
    };
  }

  test(`${framework}: fresh downloads and verified cache hits preserve artifact bytes`, (t) => {
    const f = fixture(t);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = f.run();
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(path.join(f.directory, 'pyroscope-otel-extension.jar'), 'utf8'), pyro);
      assert.equal(readFileSync(path.join(f.directory, 'opentelemetry-javaagent.jar'), 'utf8'), agent);
    }
    assert.equal(f.requests().length, 2);
    assert.ok(f.requests().every((request) => request.includes("--proto =https --proto-redir =https")));
    assert.match(f.requests()[1], /https:\/\/example.invalid\/custom-agent.jar$/);
    assert.deepEqual(readdirSync(path.join(f.directory, 'cache')).sort(), Object.values(f.cache).sort());
  });

  for (const key of ['pyro', 'agent']) {
    test(`${framework}: rejects corrupted ${key} cache hits`, (t) => {
      const f = fixture(t);
      f.seed('pyro', pyro);
      f.seed('agent', agent);
      f.seed(key, 'poisoned executable bytes');
      assert.notEqual(f.run().status, 0);
      assert.equal(f.requests().length, 0);
    });
  }

  test(`${framework}: rejects changed upstream bytes without publishing them to cache`, (t) => {
    const f = fixture(t, { TEST_AGENT_CONTENT: 'substituted upstream agent' });
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(path.join(f.directory, 'cache', f.cache.agent)), false);
    assert.equal(existsSync(path.join(f.directory, 'opentelemetry-javaagent.jar')), false);
    assert.ok(readdirSync(path.join(f.directory, 'cache')).every((name) => !name.includes('.tmp.')));
  });

  test(`${framework}: interrupted transfers never become cache hits`, (t) => {
    const f = fixture(t, { TEST_INTERRUPT: '1' });
    assert.notEqual(f.run().status, 0);
    assert.deepEqual(readdirSync(path.join(f.directory, 'cache')), []);
    assert.equal(existsSync(path.join(f.directory, 'pyroscope-otel-extension.jar')), false);
  });

  test(`${framework}: a different digest for the same version cannot reuse the old agent`, (t) => {
    const replacement = 'reviewed replacement agent';
    const f = fixture(t, { OTEL_JAVA_AGENT_SHA256: digest(replacement), TEST_AGENT_CONTENT: replacement });
    writeFileSync(path.join(f.directory, 'cache', `opentelemetry-javaagent-2.33.1-${digest(agent)}.jar`), agent);
    assert.equal(f.run().status, 0);
    assert.equal(f.requests().length, 2);
    assert.equal(readFileSync(path.join(f.directory, 'opentelemetry-javaagent.jar'), 'utf8'), replacement);
  });

  test(`${framework}: legacy profiling releases preserve their asset name`, (t) => {
    const f = fixture(t, { OTEL_PYROSCOPE_VERSION: '1.0.0' });
    assert.equal(f.run().status, 0);
    assert.match(f.requests()[0], /\/v1.0.0\/pyroscope-otel.jar$/);
    assert.equal(readFileSync(path.join(f.directory, 'pyroscope-otel-extension.jar'), 'utf8'), pyro);
  });

  test(`${framework}: missing or malformed checksums cause zero requests`, (t) => {
    for (const key of ['OTEL_PYROSCOPE_SHA256', 'OTEL_JAVA_AGENT_SHA256']) {
      for (const value of ['', 'a'.repeat(63), 'g'.repeat(64), `${digest(agent)}\n`]) {
        const f = fixture(t, { [key]: value });
        assert.notEqual(f.run().status, 0);
        assert.equal(f.requests().length, 0);
      }
    }
  });
}

test('all six services use the same reviewed artifact pins', () => {
  for (const value of pins) assert.deepEqual(value, pins[0]);
});
