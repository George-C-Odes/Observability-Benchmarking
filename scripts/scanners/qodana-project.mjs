import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function scopedPoms(root, directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'target') return scopedPoms(root, path);
    return entry.isFile() && entry.name === 'pom.xml' ? [`$PROJECT_DIR$/${relative(root, path).replaceAll('\\', '/')}`] : [];
  });
}

// Accept only the repository's literal IDE inventory format. No XML entities are
// expanded, and unsupported/ambiguous inventories fail before any file is written.
export function projectForScope(xml, poms, scope) {
  if (!['services/java', 'utils/orchestrator'].includes(scope)) throw new Error('Unsupported Qodana scope');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML declarations are unsupported');
  const components = [...xml.matchAll(/<component name="MavenProjectsManager">[\s\S]*?<\/component>/g)];
  if (components.length !== 1) throw new Error('Expected one Maven import component');
  const lists = [...components[0][0].matchAll(/<option name="originalFiles">\s*<list>([\s\S]*?)<\/list>\s*<\/option>/g)];
  if (lists.length !== 1) throw new Error('Expected one Maven import inventory');
  const content = lists[0][1];
  const entryPattern = /<option value="(\$PROJECT_DIR\$\/[a-zA-Z0-9_./-]+\/pom\.xml)"\s*\/>/g;
  if (content.replace(entryPattern, '').trim()) throw new Error('Unsupported Maven import entries');
  const entries = [...content.matchAll(entryPattern)];
  const selected = entries.filter((match) => match[1].startsWith(`$PROJECT_DIR$/${scope}/`));
  const values = selected.map((match) => match[1]);
  if (values.length === 0 || new Set(values).size !== values.length ||
    JSON.stringify([...values].sort((a, b) => a.localeCompare(b))) !==
    JSON.stringify([...poms].sort((a, b) => a.localeCompare(b)))) throw new Error('Maven inventory differs from scoped POMs');
  const replacement = entries.filter((match) => !values.includes(match[1])).reduce((text, match) => text.replace(match[0], ''), content);
  const component = components[0][0].replace(lists[0][0], lists[0][0].replace(content, replacement));
  return xml.replace(components[0][0], component);
}

export function scopeProject(root, scope) {
  if (!['services/java', 'utils/orchestrator'].includes(scope)) throw new Error('Unsupported Qodana scope');
  const config = join(root, '.idea/misc.xml');
  const poms = scopedPoms(root, join(root, scope));
  const xml = projectForScope(readFileSync(config, 'utf8'), poms, scope);
  writeFileSync(config, xml);
  return poms.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const scope = process.argv[2];
  console.log(`Qodana Maven import: ${scopeProject(fileURLToPath(new URL('../../', import.meta.url)), scope)} projects in ${scope}`);
}
