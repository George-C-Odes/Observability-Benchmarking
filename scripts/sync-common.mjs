import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { resolveRepoPath } from './render-readmes.mjs';

export function readLiteralVersion(variables, key) {
  const version = Object.hasOwn(variables, key) ? variables[key] : '';
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(version)) {
    throw new Error(`Missing or invalid version ${key} in the env file (expected an unquoted literal version)`);
  }
  return version;
}

export function readSyncFile(filePath, transform, errorLabel) {
  try {
    const existing = readFileSync(filePath, 'utf8');
    const content = transform(existing);
    return { filePath, content, changed: content !== existing };
  } catch (error) {
    throw new Error(`${errorLabel}: ${error.message}`, { cause: error });
  }
}

export function finishSync(results, { check, description, scriptName, displayPath }) {
  const changed = results.filter((result) => result.changed);
  if (check && changed.length > 0) {
    throw new Error(`${description} are out of date. Run node scripts/${scriptName}:\n${changed.map(({ filePath }) => displayPath(filePath)).join('\n')}`);
  }
  if (!check) {
    for (const { filePath, content } of changed) writeFileSync(filePath, content, 'utf8');
  }
  return results;
}

export function runSyncCli(moduleUrl, sync, label, displayPath = (filePath) => path.relative(resolveRepoPath('.'), filePath)) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(moduleUrl)) return;
  try {
    let envPath = 'compose/.env';
    let check = false;
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 1) {
      switch (args[index]) {
        case '--env':
          envPath = args[++index];
          if (!envPath || envPath.startsWith('--')) throw new Error('Expected a path after --env');
          break;
        case '--check':
          check = true;
          break;
        case '--help':
        case '-h':
          console.log(`Usage: node scripts/${path.basename(fileURLToPath(moduleUrl))} [--env path/to/.env] [--check]`);
          return;
        default:
          throw new Error(`Unknown argument: ${args[index]}`);
      }
    }
    const results = sync({ envPath, check });
    for (const { filePath, changed } of results) {
      if (changed) console.log(`Updated ${displayPath(filePath)}`);
    }
    console.log(`Checked ${results.length} ${label}; ${results.filter(({ changed }) => changed).length} updated.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
