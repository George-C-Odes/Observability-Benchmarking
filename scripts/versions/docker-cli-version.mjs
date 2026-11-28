// The orchestrator image's Docker CLI stage is the single source for the
// documented Docker CLI version. Renovate updates this ARG; docs read it.
export const dockerCliDockerfile = 'utils/orchestrator/Dockerfile';
export const dockerCliVersionKey = 'DOCKER_CLI_VERSION';

const dockerCliArgPattern = /^ARG IMAGE_DOCKER_CLI=docker:(\d+\.\d+\.\d+)(-cli(?:-alpine\d+\.\d+)?)@sha256:([a-f0-9]{64})\r?$/gm;

function readDockerCliPin(content) {
  const matches = [...content.matchAll(dockerCliArgPattern)];
  if (matches.length !== 1 || content.split('IMAGE_DOCKER_CLI=').length !== 2) {
    throw new Error(`Expected one digest-pinned stable docker:<X.Y.Z>-cli image in ${dockerCliDockerfile}`);
  }
  const [{ 1: version, 3: digest, index }] = matches;
  return { version, digest, index };
}

export function readDockerCliVersion(content) {
  return readDockerCliPin(content).version;
}

function maskDockerCliPin(content) {
  const { version, digest, index } = readDockerCliPin(content);
  const end = content.indexOf('\n', index);
  const line = content.slice(index, end === -1 ? content.length : end);
  const masked = line.replace(`docker:${version}-`, 'docker:<version>-').replace(`@sha256:${digest}`, '@sha256:<digest>');
  return content.slice(0, index) + masked + content.slice(index + line.length);
}

// Returns whether the documented version changed; digest-only refreshes return false.
export function validateDockerCliChange(base, head) {
  if (maskDockerCliPin(base) !== maskDockerCliPin(head)) {
    throw new Error(`Renovate may change only the Docker CLI image version and digest in ${dockerCliDockerfile}`);
  }
  return readDockerCliVersion(base) !== readDockerCliVersion(head);
}

export function dockerCliTemplateVariables(keys, readSource) {
  if (!keys.has(dockerCliVersionKey)) return {};
  return { [dockerCliVersionKey]: readDockerCliVersion(readSource(dockerCliDockerfile)) };
}
