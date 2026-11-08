import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const languages = new Map([['java-kotlin', 'java'], ['python', 'python'], ['go', 'go'], ['javascript-typescript', 'javascript']]);

// Requests stay within the pinned action's defaults and its exact bundle release.
// Metadata URLs are ignored; numeric asset IDs and SHA-256 digests are validated.
export async function resolveCodeqlBundle(actionSha, language, fetchImpl = fetch) {
  if (typeof actionSha !== 'string' || !/^[a-f0-9]{40}$/.test(actionSha) || actionSha.trim() !== actionSha || !languages.has(language)) {
    throw new Error('Invalid CodeQL action SHA or language');
  }
  async function json(url) {
    // S8476 review: defaults.bundleVersion -> release-tag URL -> this fetch.
    // Both callers fix HTTPS origins and github/codeql-action resource paths;
    // the action SHA is 40 hex digits, and the response-derived tag must equal
    // codeql-bundle-v plus a numeric X.Y.Z version, then is component-encoded.
    // Redirects are rejected and no credentials are sent. Boundary coverage:
    // codeql-bundle.test.mjs rejects malicious inputs before further requests.
    // User-approved 2026-11-08: NOSONAR suppresses all findings on this line.
    // Re-review/remove if callers, scope, validation, encoding or redirects change.
    const response = await fetchImpl(url, { // NOSONAR - reviewed S8476 false positive; rationale and line-wide scope above.
      method: 'GET', headers: { Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`CodeQL bundle lookup failed: HTTP ${response.status}`);
    return response.json();
  }
  const defaults = await json(`https://raw.githubusercontent.com/github/codeql-action/${actionSha}/src/defaults.json`);
  const version = defaults?.cliVersion;
  if (typeof version !== 'string' || version.trim() !== version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || defaults.bundleVersion !== `codeql-bundle-v${version}`) {
    throw new Error('Unexpected CodeQL bundle version metadata');
  }
  const tag = defaults.bundleVersion;
  const release = await json(`https://api.github.com/repos/github/codeql-action/releases/tags/${encodeURIComponent(tag)}`);
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
    const result = await resolveCodeqlBundle(codeqlActionSha(wrapper), process.argv[2]);
    for (const [key, value] of Object.entries(result)) console.log(`${key}=${value}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
