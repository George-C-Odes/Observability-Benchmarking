import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { resolveRepoPath } from './render-readmes.mjs';
import { temporaryDirectory } from './test-helpers.mjs';
import { javaFrameworkVersions, syncJavaPomVersions, syncJavaPomXml } from './sync-java-pom-versions.mjs';

test('every service mapping updates only its framework property and is repeatable', () => {
  let count = 0;
  for (const { property, modules } of javaFrameworkVersions) {
    for (const module of modules) {
      const original = readFileSync(resolveRepoPath(`services/java/${module}/pom.xml`), 'utf8');
      const actual = syncJavaPomXml(original, property, '91.3.5-RC1');
      const tag = property.replaceAll('.', '\\.');
      assert.equal(actual, original.replace(new RegExp(`(<${tag}>)[^<]+(</${tag}>)`), '$191.3.5-RC1$2'), module);
      assert.equal(syncJavaPomXml(actual, property, '91.3.5-RC1'), actual, module);
      count += 1;
    }
  }
  assert.equal(count, 17);
  assert.equal(javaFrameworkVersions.find(({ key }) => key === 'SPARK_VERSION').property, 'spark-core.version');
  assert.equal(javaFrameworkVersions.find(({ key }) => key === 'PEKKO_VERSION').property, 'pekko.version');
});

test('comments, whitespace, CRLF and unrelated version properties are preserved', () => {
  const xml = '<project>\r\n<!-- <properties><pekko.version>0.0.0</pekko.version></properties> -->\r\n<properties>\r\n  <pekko.version>  1.3.0 \r\n  </pekko.version>\r\n  <pekko.core.version>1.6.0</pekko.core.version>\r\n</properties>\r\n</project>\r\n';
  const actual = syncJavaPomXml(xml, 'pekko.version', '2.0.0');
  assert.equal(actual, xml.replace('  1.3.0 ', '  2.0.0 '));
  const annotated = '<properties><pekko.version><!-- selected --> 1.3.0 <!-- end --></pekko.version></properties>';
  assert.equal(syncJavaPomXml(annotated, 'pekko.version', '2.0.0'), annotated.replace('1.3.0', '2.0.0'));
  assert.throws(() => syncJavaPomXml('<properties><pekko.version>1.<!-- embedded -->3.0</pekko.version></properties>', 'pekko.version', '2.0.0'), /without embedded XML/);
});

test('missing, commented, misplaced and duplicate declarations fail without guessing', () => {
  for (const xml of [
    '<project><properties/></project>',
    '<project><!-- <properties><x.version>1</x.version></properties> --></project>',
    '<project><x.version>1</x.version></project>',
    '<project><properties><x.version>1</x.version><x.version>2</x.version></properties></project>',
    '<project><properties><x.version>1</x.version></properties><profiles><profile><properties><x.version>2</x.version></properties></profile></profiles></project>',
  ]) {
    assert.throws(() => syncJavaPomXml(xml, 'x.version', '3'), /Expected exactly one/);
  }
  assert.throws(() => syncJavaPomXml('<properties><x-version>1</x-version></properties>', 'x.version', '3'), /found 0/);
  assert.throws(() => syncJavaPomXml('', 'x.*', '3'), /Invalid Maven property/);
  for (const version of [undefined, '', '${another.version}', '<bad>', '1.0 # comment', '"1.0"', '1 2']) {
    assert.throws(() => syncJavaPomXml('', 'x.version', version), /Invalid version/);
  }
});

function fixture(t) {
  const directory = temporaryDirectory(t, 'sync-java-pom-versions-');
  const envPath = path.join(directory, '.env');
  const javaDirectory = path.join(directory, 'java');
  const originals = new Map();
  const envLines = [];
  for (const [index, { key, property, modules }] of javaFrameworkVersions.entries()) {
    envLines.push(`#${key}: 0.0.0`, `${key}: 91.${index}.5`);
    for (const module of modules) {
      const file = path.join(javaDirectory, module, 'pom.xml');
      mkdirSync(path.dirname(file), { recursive: true });
      const xml = `<project>\r\n<properties><${property}>1.0.0</${property}><other.version>9.9.9</other.version></properties>\r\n</project>\r\n`;
      writeFileSync(file, xml);
      originals.set(file, xml);
    }
  }
  writeFileSync(envPath, envLines.join('\r\n'));
  return { directory, envPath, javaDirectory, originals };
}

test('check is read-only; all env mappings apply; repeat runs skip writes and unrelated POMs', (t) => {
  const { envPath, javaDirectory, originals } = fixture(t);
  const excluded = path.join(javaDirectory, 'pom.xml');
  writeFileSync(excluded, '<project/>');
  assert.throws(() => syncJavaPomVersions({ envPath, javaDirectory, check: true }), /out of date/);
  for (const [file, original] of originals) assert.equal(readFileSync(file, 'utf8'), original);
  const results = syncJavaPomVersions({ envPath, javaDirectory });
  assert.equal(results.length, 17);
  assert.ok(results.every(({ changed }) => changed));
  for (const [index, { property, modules }] of javaFrameworkVersions.entries()) {
    for (const module of modules) {
      const file = path.join(javaDirectory, module, 'pom.xml');
      assert.equal(readFileSync(file, 'utf8'), originals.get(file).replace(`<${property}>1.0.0`, `<${property}>91.${index}.5`));
    }
  }
  assert.equal(readFileSync(excluded, 'utf8'), '<project/>');
  const mtimes = results.map(({ filePath }) => statSync(filePath).mtimeMs);
  assert.ok(syncJavaPomVersions({ envPath, javaDirectory, check: true }).every(({ changed }) => !changed));
  assert.ok(syncJavaPomVersions({ envPath, javaDirectory }).every(({ changed }) => !changed));
  assert.deepEqual(results.map(({ filePath }) => statSync(filePath).mtimeMs), mtimes);
});

test('missing or invalid env values prevent writes to every POM in the batch', (t) => {
  const { envPath, javaDirectory, originals } = fixture(t);
  const env = readFileSync(envPath, 'utf8');
  for (const replacement of ['', 'PEKKO_VERSION: bad<xml>', 'PEKKO_VERSION: "1.0"']) {
    writeFileSync(envPath, env.replace(/^PEKKO_VERSION:.*$/m, replacement));
    assert.throws(() => syncJavaPomVersions({ envPath, javaDirectory }), /Missing or invalid version PEKKO_VERSION/);
    for (const [file, original] of originals) assert.equal(readFileSync(file, 'utf8'), original);
  }
});

test('a missing POM or malformed property prevents earlier POMs from being written', (t) => {
  const { envPath, javaDirectory, originals } = fixture(t);
  const last = path.join(javaDirectory, 'pekko/jvm/pom.xml');
  writeFileSync(last, '<project><properties/></project>');
  assert.throws(() => syncJavaPomVersions({ envPath, javaDirectory }), /pekko\/jvm\/pom.xml:.*found 0/);
  rmSync(last);
  assert.throws(() => syncJavaPomVersions({ envPath, javaDirectory }), /pekko\/jvm\/pom.xml:.*ENOENT/);
  for (const [file, original] of originals) {
    if (file !== last) assert.equal(readFileSync(file, 'utf8'), original);
  }
});
