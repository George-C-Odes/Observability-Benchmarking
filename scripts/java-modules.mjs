import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Coverage policy is the existing authoritative JVM module inventory.
export const modules = Object.entries(JSON.parse(readFileSync(new URL('./coverage-thresholds.json', import.meta.url), 'utf8')).modules)
  .filter(([, module]) => module.format === 'java')
  .map(([name, module]) => ({ name, module_dir: module.path }));

if (modules.length === 0 || modules.some(({ name, module_dir }) => !/^[a-z0-9-]+$/.test(name)
  || !/^(?:services\/java\/[a-z0-9/-]+|utils\/orchestrator)$/.test(module_dir)
  || module_dir.split('/').some((part) => !part || part === '.' || part === '..'))) {
  throw new Error('Invalid JVM coverage inventory');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(process.argv.includes('--paths') ? modules.map((module) => module.module_dir).join('\n') : JSON.stringify({ include: modules }));
}
