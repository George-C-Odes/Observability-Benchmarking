import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const languages = new Map([['java-kotlin', 'java'], ['python', 'python'], ['go', 'go'], ['javascript-typescript', 'javascript']]);
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);
const transientCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

function transient(error) {
  return error?.retryable === true || ['TimeoutError', 'AbortError'].includes(error?.name) || transientCodes.has(error?.code) || transientCodes.has(error?.cause?.code);
}

// Requests stay within the pinned action's defaults and its exact bundle release.
// Metadata URLs are ignored; numeric asset IDs and SHA-256 digests are validated.
export async function resolveCodeqlBundle(actionSha, language, fetchImpl = fetch, { wait = sleep, warn = console.error, lock } = {}) {
  if (typeof actionSha !== 'string' || !/^[a-f0-9]{40}$/.test(actionSha) || actionSha.trim() !== actionSha || !languages.has(language)) {
    throw new Error('Invalid CodeQL action SHA or language');
  }
  async function json(url, operation, accept = 'application/json') {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        // S8476 review: defaults.bundleVersion -> release-tag URL -> this fetch.
        // All callers fix HTTPS origins and github/codeql-action resource paths;
        // the action SHA is 40 hex digits, and the response-derived tag must equal
        // codeql-bundle-v plus a numeric X.Y.Z version, then is component-encoded.
        // Redirects are rejected and no credentials are sent. Boundary coverage:
        // codeql-bundle.test.mjs rejects malicious inputs before further requests.
        // User-approved 2026-11-08: NOSONAR suppresses all findings on this line.
        // Re-reviewed 2026-11-08: retries retain the exact URL; the defaults fallback
        // fixes contents/src/defaults.json and uses the same validated SHA as ref.
        // Re-review/remove if callers, scope, validation, encoding or redirects change.
        const response = await fetchImpl(url, { // NOSONAR - reviewed S8476 false positive; rationale and line-wide scope above.
          method: 'GET', headers: { Accept: accept },
          redirect: 'error', signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(new Error(`${operation} failed: HTTP ${response.status}`), { retryable: transientStatuses.has(response.status) });
        }
        return await response.json();
      } catch (error) {
        if (!transient(error) || attempt === 3) throw error;
        const delay = 2_000 * 2 ** (attempt - 1);
        warn(`${operation}: transient failure on attempt ${attempt}/3; retrying in ${delay / 1000}s.`);
        await wait(delay);
      }
    }
  }
  // The reviewed lock removes metadata network dependencies only for this exact
  // action pin. Upgrades use live metadata instead of silently using an old CLI.
  const snapshot = lock?.actionSha === actionSha ? lock : undefined;
  let defaults;
  if (snapshot) {
    defaults = snapshot.defaults;
  } else {
    try {
      defaults = await json(`https://raw.githubusercontent.com/github/codeql-action/${actionSha}/src/defaults.json`, 'CodeQL defaults (raw)');
    } catch (error) {
      if (!transient(error)) throw error;
      warn('CodeQL defaults raw endpoint unavailable; trying the same pinned file through the contents API.');
      const query = new URLSearchParams({ ref: actionSha });
      defaults = await json(`https://api.github.com/repos/github/codeql-action/contents/src/defaults.json?${query}`, 'CodeQL defaults (contents API)', 'application/vnd.github.raw+json');
    }
  }
  const version = defaults?.cliVersion;
  if (typeof version !== 'string' || version.trim() !== version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || defaults.bundleVersion !== `codeql-bundle-v${version}`) {
    throw new Error('Unexpected CodeQL bundle version metadata');
  }
  const tag = defaults.bundleVersion;
  const release = snapshot ? snapshot.release : await json(`https://api.github.com/repos/github/codeql-action/releases/tags/${encodeURIComponent(tag)}`, 'CodeQL bundle release');
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error('Unexpected CodeQL release metadata');
  const name = `codeql-bundle-${languages.get(language)}-linux64.tar.zst`;
  const assets = release.assets.filter((asset) => asset?.name === name);
  if (assets.length !== 1 || !Number.isSafeInteger(assets[0].id) || assets[0].id <= 0 || typeof assets[0].digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(assets[0].digest) || assets[0].digest.trim() !== assets[0].digest) {
    throw new Error('Missing, ambiguous or invalid CodeQL bundle asset or digest');
  }
  return {
    download_url: `https://github.com/github/codeql-action/releases/download/${encodeURIComponent(tag)}/${name}`,
    api_url: `https://api.github.com/repos/github/codeql-action/releases/assets/${assets[0].id}`,
    sha256: assets[0].digest.slice(7),
  };
}

export function codeqlActionSha(wrapper) {
  const refs = [...wrapper.matchAll(/uses: github\/codeql-action\/[a-z-]+@(\S+)/g)].map((match) => match[1]);
  if (refs.length !== 3 || new Set(refs).size !== 1) throw new Error('CodeQL action pins must agree');
  return refs[0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const wrapper = readFileSync(new URL('../.github/actions/codeql-action/action.yml', import.meta.url), 'utf8');
    const lock = JSON.parse(readFileSync(new URL('../.github/actions/codeql-action/bundle-lock.json', import.meta.url), 'utf8'));
    const result = await resolveCodeqlBundle(codeqlActionSha(wrapper), process.argv[2], fetch, { lock });
    for (const [key, value] of Object.entries(result)) console.log(`${key}=${value}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
