const documentedActions = [
  {
    workflow: 'qodana_code_quality',
    wrapper: 'upload-artifact',
    upstream: /^actions\/upload-artifact$/,
    versionKey: 'QODANA_UPLOAD_ARTIFACT_VERSION',
  },
  {
    workflow: 'pages',
    wrapper: 'download-artifact',
    upstream: /^actions\/download-artifact$/,
    versionKey: 'PAGES_DOWNLOAD_ARTIFACT_VERSION',
  },
  {
    workflow: 'codeql',
    wrapper: 'codeql-action',
    upstream: /^github\/codeql-action\/(?:init|analyze|upload-sarif)$/,
    versionKey: 'CODEQL_ACTION_VERSION',
    shaKey: 'CODEQL_ACTION_SHA',
  },
];

function readUses(content) {
  // The comment consumes trailing whitespace on its line.
  return [...content.matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]+(['"]?)([^\s#'"]+)\1(?:[ \t]+(#[^\r\n]*)?)?\r?$/gm)]
    .map(([, , ref, comment = '']) => ({ ref, comment }));
}

function readPin({ ref, comment }, sourcePath) {
  const sha = /@([a-f0-9]{40})$/.exec(ref)?.[1];
  const version = /^#[ \t]+(v\d+\.\d+\.\d+(?:-[\w.-]+)?)(?=[; \t]|$)/.exec(comment)?.[1];
  if (!sha || !version) {
    throw new Error(`Expected a SHA pin and version comment for ${ref} in ${sourcePath}`);
  }
  return { sha, version };
}

function actionPin({ workflow, wrapper, upstream }, readSource) {
  const workflowPath = `.github/workflows/${workflow}.yml`;
  const wrapperPath = `.github/actions/${wrapper}`;
  const matchesUpstream = ({ ref }) => upstream.test(ref.split('@')[0]);
  const uses = readUses(readSource(workflowPath));
  const pins = uses.filter(matchesUpstream).map((use) => readPin(use, workflowPath));
  if (uses.some(({ ref }) => ref === `./${wrapperPath}`)) {
    const actionPath = `${wrapperPath}/action.yml`;
    const wrappedUses = readUses(readSource(actionPath)).filter(matchesUpstream);
    if (wrappedUses.length === 0) throw new Error(`Missing ${wrapper} pin in ${actionPath}`);
    pins.push(...wrappedUses.map((use) => readPin(use, actionPath)));
  }

  const [pin, ...otherPins] = pins;
  if (!pin) throw new Error(`Missing ${wrapper} in ${workflowPath}`);
  if (otherPins.some(({ sha, version }) => sha !== pin.sha || version !== pin.version)) {
    throw new Error(`Conflicting ${wrapper} pins for ${workflowPath}`);
  }
  return pin;
}

export function workflowActionTemplateVariables(keys, readSource) {
  const variables = {};
  for (const action of documentedActions) {
    const { versionKey, shaKey } = action;
    if (!keys.has(versionKey) && !keys.has(shaKey)) continue;

    const { sha, version } = actionPin(action, readSource);
    variables[versionKey] = version;
    if (shaKey) variables[shaKey] = sha;
  }
  return variables;
}
