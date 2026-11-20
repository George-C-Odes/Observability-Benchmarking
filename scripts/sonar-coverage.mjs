import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputRoot = '.sonar/inputs';
export const inventory = JSON.parse(readFileSync(new URL('./coverage-thresholds.json', import.meta.url), 'utf8')).modules;
const entries = Object.entries(inventory)
  .filter(([name]) => name !== 'django-common')
  .map(([name, module]) => ({ name, module, revisionFile: `${inputRoot}/revisions/${name}.json` }));

// CLI roots are fixed by this module, never by arguments, environment or artifacts.
// Reject redirected parents before reads/writes in the isolated Actions workspace.
export function workspacePath(workspace, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.posix.isAbsolute(relative)
    || relative.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':')
      || [...part].some((char) => char.codePointAt(0) < 32))) throw new Error('Invalid Sonar input path');
  let current = workspace;
  if (lstatSync(current).isSymbolicLink()) throw new Error('Redirected Sonar workspace');
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (isLink(current)) throw new Error('Redirected Sonar input');
  }
  return current;
}

function isLink(location) {
  try { return lstatSync(location).isSymbolicLink(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

function moduleEntry(requestedName) {
  const entry = entries.find(({ name }) => name === requestedName);
  if (!entry) throw new Error('Unknown coverage module');
  return entry;
}

function revision(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value) || value.trim() !== value) throw new Error('Invalid coverage revision');
  return value;
}

function write(workspace, relative, content) {
  const target = workspacePath(workspace, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function reportPaths(module) {
  if (module.format === 'java') return [`${module.path}/target/site/jacoco/jacoco.xml`];
  if (module.format === 'go') return [`${module.path}/coverage.out`];
  if (module.format === 'python') return [`${module.path}/coverage.xml`];
  if (module.format === 'nextjs') return ['node', 'dom'].map((environment) => `${module.path}/coverage/${environment}/lcov.info`);
  throw new Error('Unsupported coverage format');
}

function files(workspace, directory, extension) {
  const location = workspacePath(workspace, directory);
  return readdirSync(location, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    workspacePath(workspace, relative);
    if (entry.isDirectory()) return files(workspace, relative, extension);
    if (!entry.isFile()) throw new Error('Invalid analysis file type');
    return entry.name.endsWith(extension) ? [relative] : [];
  });
}

function requiredFile(workspace, relative) {
  const location = workspacePath(workspace, relative);
  if (!lstatSync(location).isFile() || lstatSync(location).size === 0) throw new Error(`Missing or empty analysis input: ${relative}`);
  return location;
}

function javaFiles(workspace, prefix, module) {
  return [['classes', '.class'], ['test-classes', '.class'], ['sonar-libraries', '.jar']].flatMap(([directory, extension]) => {
    const found = files(workspace, `${prefix}${module.path}/target/${directory}`, extension);
    if (found.length === 0) throw new Error(`Missing Java ${directory}: ${module.path}`);
    return found;
  });
}

export function normalizeGo(content, moduleName, directory) {
  return content.split('\n').map((line, index) => {
    if (index === 0) {
      if (!/^mode: (atomic|count|set)$/.test(line)) throw new Error('Invalid Go coverage header');
      return line;
    }
    if (!line) return line;
    if (!line.startsWith(`${moduleName}/`)) throw new Error('Unexpected Go coverage module');
    const suffix = line.slice(moduleName.length + 1);
    const source = suffix.split(':')[0];
    if (!source.endsWith('.go') || source.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid Go coverage source');
    return `${directory}/${suffix}`;
  }).join('\n');
}

export function normalizeLcov(content, workspace, directory) {
  return content.split('\n').map((line) => {
    if (!line.startsWith('SF:')) return line;
    let source = line.slice(3).replaceAll('\\', '/');
    if (path.isAbsolute(source)) source = path.relative(workspace, source).replaceAll('\\', '/');
    else if (!source.startsWith(`${directory}/`)) source = `${directory}/${source}`;
    workspacePath(workspace, source);
    if (!source.startsWith(`${directory}/`)) throw new Error('LCOV source outside dashboard');
    return `SF:${source}`;
  }).join('\n');
}

export function stage(workspace, requestedName, sha) {
  revision(sha);
  // The CLI selects an inventory entry. Output paths come from that entry.
  const { name, module, revisionFile } = moduleEntry(requestedName);
  const sources = reportPaths(module);
  if (module.format === 'java') sources.push(...javaFiles(workspace, '', module));
  // Validate the entire selected inventory before creating any output.
  workspacePath(workspace, revisionFile);
  for (const source of sources) {
    requiredFile(workspace, source);
    workspacePath(workspace, `${inputRoot}/${source}`);
  }
  for (const source of sources) {
    const from = workspacePath(workspace, source);
    const destination = `${inputRoot}/${source}`;
    if (module.format === 'go') {
      const moduleName = /^module\s+(\S+)/m.exec(readFileSync(workspacePath(workspace, `${module.path}/go.mod`), 'utf8'))?.[1];
      if (!moduleName) throw new Error('Missing Go module name');
      write(workspace, destination, normalizeGo(readFileSync(from, 'utf8'), moduleName, module.path));
    } else if (module.format === 'nextjs') {
      write(workspace, destination, normalizeLcov(readFileSync(from, 'utf8'), workspace, module.path));
    } else {
      const target = workspacePath(workspace, destination);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(from, target);
    }
  }
  write(workspace, revisionFile, JSON.stringify({ name, revision: sha }));
}

export function prepare(workspace, sha) {
  revision(sha);
  const javascriptToolingReport = '.sonar/ci-tooling.lcov.info';
  const pythonToolingReport = '.sonar/ci-tooling.cobertura.xml';
  requiredFile(workspace, javascriptToolingReport);
  requiredFile(workspace, pythonToolingReport);
  const reports = new Map(['java', 'go', 'python', 'nextjs'].map((format) => [format, []]));
  for (const { name, module, revisionFile } of entries) {
    const evidence = JSON.parse(readFileSync(requiredFile(workspace, revisionFile), 'utf8'));
    if (evidence.name !== name || evidence.revision !== sha) throw new Error(`Coverage revision mismatch: ${name}`);
    for (const report of reportPaths(module)) {
      const relative = `${inputRoot}/${report}`;
      requiredFile(workspace, relative);
      reports.get(module.format).push(relative);
    }
    if (module.format === 'java') javaFiles(workspace, `${inputRoot}/`, module);
  }
  const shared = readFileSync(workspacePath(workspace, '.sonarcloud.properties'), 'utf8');
  const ci = readFileSync(workspacePath(workspace, 'sonar-project.properties'), 'utf8');
  const testRoots = /^sonar.tests=(.+)$/m.exec(shared)?.[1].trim();
  const testPatterns = /^sonar.test.inclusions=(.+)$/m.exec(shared)?.[1].trim();
  if (!testRoots || !testPatterns) throw new Error('Missing shared test classification');
  const java = entries.filter(({ module }) => module.format === 'java').map(({ module }) => `${inputRoot}/${module.path}/target`);
  const config = [shared.trim(), ci.trim(),
    `sonar.tests=${testRoots},services/java,utils/orchestrator/src/test`,
    `sonar.test.inclusions=${testPatterns},services/java/**/src/test/**,utils/orchestrator/src/test/**`,
    `sonar.coverage.jacoco.xmlReportPaths=${reports.get('java').join(',')}`,
    `sonar.go.coverage.reportPaths=${reports.get('go').join(',')}`,
    `sonar.python.coverage.reportPaths=${[...reports.get('python'), pythonToolingReport].join(',')}`,
    `sonar.javascript.lcov.reportPaths=${[...reports.get('nextjs'), javascriptToolingReport].join(',')}`,
    `sonar.java.binaries=${java.map((directory) => `${directory}/classes`).join(',')}`,
    `sonar.java.test.binaries=${java.map((directory) => `${directory}/test-classes`).join(',')}`,
    `sonar.java.libraries=${java.map((directory) => `${directory}/sonar-libraries/*.jar`).join(',')}`,
    `sonar.java.test.libraries=${java.map((directory) => `${directory}/sonar-libraries/*.jar`).join(',')}`,
  ].join('\n');
  write(workspace, '.sonar/analysis.properties', `${config}\n`);
  return config;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [operation, name, ...extra] = process.argv.slice(2);
  if (operation === 'stage' && name && extra.length === 0) stage(root, name, process.env.GITHUB_SHA);
  else if (operation === 'prepare' && name === undefined) prepare(root, process.env.GITHUB_SHA);
  else throw new Error('Expected stage MODULE or prepare');
}
