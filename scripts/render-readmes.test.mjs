import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deriveOutputPath, loadManifestTemplatePaths, parseColonEnv, realignMarkdownTables, renderTemplate, renderTemplates, resolveTemplatePaths } from './render-readmes.mjs';

function testParseColonEnv() {
  const env = parseColonEnv(`
# Commented values must be ignored
#SPRING_BOOT_VERSION: 3.5.13
HOST_REPO: C:\\Users\\example\\repo
SPRING_BOOT_VERSION: 4.0.5
IMAGE_TAG: ghcr.io/acme/app:1.2.3
`);

  assert.equal(env.HOST_REPO, 'C:\\Users\\example\\repo');
  assert.equal(env.SPRING_BOOT_VERSION, '4.0.5');
  assert.equal(env.IMAGE_TAG, 'ghcr.io/acme/app:1.2.3');
  assert.equal(env['#SPRING_BOOT_VERSION'], undefined);
}

function testRenderTemplate() {
  const rendered = renderTemplate('Spring {{SPRING_BOOT_VERSION}} / Go {{GO_VERSION}}', {
    SPRING_BOOT_VERSION: '4.0.5',
    GO_VERSION: '1.26.2',
  });

  assert.equal(rendered, 'Spring 4.0.5 / Go 1.26.2');

  const githubActionsSnippet = renderTemplate('Build ${{ matrix.service.name }} with {{GO_VERSION}}', {
    GO_VERSION: '1.26.2',
  });

  assert.equal(githubActionsSnippet, 'Build ${{ matrix.service.name }} with 1.26.2');

  const jekyllSnippet = renderTemplate("Image {{ '/images/foo.png' | relative_url }} with {{GO_VERSION}}", {
    GO_VERSION: '1.26.2',
  });

  assert.equal(jekyllSnippet, "Image {{ '/images/foo.png' | relative_url }} with 1.26.2");

  assert.throws(
    () => renderTemplate('Missing {{QUARKUS_VERSION}}', { SPRING_BOOT_VERSION: '4.0.5' }),
    /Missing value for placeholder \{\{QUARKUS_VERSION}}/,
  );
}

function testDeriveOutputPath() {
  assert.equal(
    deriveOutputPath(path.join('services', 'README.template.md')),
    path.join('services', 'README.md'),
  );

  assert.throws(
    () => deriveOutputPath(path.join('services', 'README.md')),
    /Template path must end with '.template\.md'/,
  );
}

function testLoadManifestTemplatePaths() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'render-readmes-manifest-'));

  try {
    const manifestPath = path.join(tempDir, 'render-readmes.manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ defaultTemplatePaths: ['README.template.md', 'docs/TESTING.template.md'] }, null, 2), 'utf8');

    assert.deepEqual(loadManifestTemplatePaths(manifestPath), ['README.template.md', 'docs/TESTING.template.md']);

    writeFileSync(manifestPath, JSON.stringify({ defaultTemplatePaths: [] }, null, 2), 'utf8');
    assert.throws(
      () => loadManifestTemplatePaths(manifestPath),
      /Manifest does not define any default template paths/,
    );

    writeFileSync(manifestPath, JSON.stringify({ defaultTemplatePaths: [''] }, null, 2), 'utf8');
    assert.throws(
      () => loadManifestTemplatePaths(manifestPath),
      /Manifest contains an invalid template path entry/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testResolveTemplatePaths() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'render-readmes-resolve-'));

  try {
    const manifestPath = path.join(tempDir, 'render-readmes.manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ defaultTemplatePaths: ['README.template.md', 'services/README.template.md'] }, null, 2), 'utf8');

    assert.deepEqual(
      resolveTemplatePaths({ templatePaths: [], manifestPath }),
      ['README.template.md', 'services/README.template.md'],
    );

    assert.deepEqual(
      resolveTemplatePaths({ templatePaths: ['docs/README.template.md'], manifestPath }),
      ['docs/README.template.md'],
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testGeneratedOutputRoundTrip() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'render-readmes-'));

  try {
    const templatePath = path.join(tempDir, 'README.template.md');
    const outputPath = path.join(tempDir, 'README.md');

    writeFileSync(templatePath, 'Version {{SPRING_BOOT_VERSION}}', 'utf8');
    writeFileSync(outputPath, 'Version 4.0.5', 'utf8');

    const rendered = renderTemplate(readFileSync(templatePath, 'utf8'), {
      SPRING_BOOT_VERSION: '4.0.5',
    });

    assert.equal(rendered, readFileSync(outputPath, 'utf8'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testRenderTemplatesResolvesRelativeEnvPath() {
  const repoTempDir = path.join(process.cwd(), 'scripts', '__tmp_render_readmes_tests');
  const templatePath = path.join(repoTempDir, 'relative-env.template.md');
  const outputPath = path.join(repoTempDir, 'relative-env.md');

  try {
    mkdirSync(repoTempDir, { recursive: true });
    writeFileSync(templatePath, 'Spring {{SPRING_BOOT_VERSION}} / Quarkus {{QUARKUS_VERSION}}', 'utf8');

    const results = renderTemplates({
      envPath: path.join('compose', '.env'),
      templatePaths: [path.join('scripts', '__tmp_render_readmes_tests', 'relative-env.template.md')],
    });

    assert.equal(results.length, 1);
    assert.equal(readFileSync(outputPath, 'utf8'), 'Spring 4.0.5 / Quarkus 3.34.6');
  } finally {
    try {
      unlinkSync(templatePath);
    } catch {
      // Ignore cleanup errors if the file was never created.
    }

    try {
      unlinkSync(outputPath);
    } catch {
      // Ignore cleanup errors if the file was never created.
    }

    try {
      rmSync(repoTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors if the directory was already removed.
    }
  }
}

function testRealignMarkdownTables() {
  // Simulates what happens when template placeholders of different lengths
  // are replaced with shorter values, leaving ragged columns.
  const ragged = [
    '| Name   | Version                 | Notes        |',
    '|--------|-------------------------|--------------|',
    '| Spring | 4.0.5 | Main framework |',
    '| Go     | 1.26.2          | Alt runtime    |',
    '| Node   | 25.9.0                  | Frontend       |',
  ].join('\n');

  const aligned = realignMarkdownTables(ragged);

  const expected = [
    '| Name   | Version | Notes          |',
    '|--------|---------|----------------|',
    '| Spring | 4.0.5   | Main framework |',
    '| Go     | 1.26.2  | Alt runtime    |',
    '| Node   | 25.9.0  | Frontend       |',
  ].join('\n');

  assert.equal(aligned, expected);

  // Non-table content must be left untouched.
  const prose = 'Hello {{SPRING_BOOT_VERSION}} world';
  assert.equal(realignMarkdownTables(prose), prose);

  // Table with alignment markers (:---:) must be preserved.
  const centered = [
    '| A   | B     |',
    '|:---:|------:|',
    '| x   | longvalue |',
  ].join('\n');

  const centeredAligned = realignMarkdownTables(centered);
  const centeredExpected = [
    '| A |         B |',
    '|:-:|----------:|',
    '| x | longvalue |',
  ].join('\n');

  assert.equal(centeredAligned, centeredExpected);

  // Table with right-aligned column must right-pad values.
  const rightAligned = [
    '| Metric | Minimum |',
    '|--------|--------:|',
    '| Line   |     15% |',
    '| Branch |     10% |',
  ].join('\n');

  const rightAlignedResult = realignMarkdownTables(rightAligned);
  const rightAlignedExpected = [
    '| Metric | Minimum |',
    '|--------|--------:|',
    '| Line   |     15% |',
    '| Branch |     10% |',
  ].join('\n');

  assert.equal(rightAlignedResult, rightAlignedExpected);
}

function main() {
  testParseColonEnv();
  testRenderTemplate();
  testDeriveOutputPath();
  testLoadManifestTemplatePaths();
  testResolveTemplatePaths();
  testGeneratedOutputRoundTrip();
  testRenderTemplatesResolvesRelativeEnvPath();
  testRealignMarkdownTables();
  console.log('render-readmes tests passed');
}

main();