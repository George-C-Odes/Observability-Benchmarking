import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const policyHead = read('docs/_includes/security-head.html');
const redirects = ['ADDING_A_SERVICE', 'adding-a-service', 'architecture', 'benchmarking',
  'control-plane', 'getting-started', 'tools-technologies'];

function assertNoInlineCode(html, name) {
  assert.doesNotMatch(html, /\s(?:style|on\w+)\s*=/i, name);
  assert.doesNotMatch(html, /<style\b/i, name);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type="application\/ld\+json"/.test(match[1])) {
      JSON.parse(match[2]); // SEO metadata is an inert data block, not executable code.
    } else {
      assert.match(match[1], /\bsrc="[^"]+"/, name);
      assert.equal(match[2].trim(), '', name);
    }
  }
}

test('document policy restricts resources without unsupported meta directives', () => {
  const content = policyHead.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const directives = new Map(content.split(';').map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources.join(' ')];
  }));
  for (const name of ['default-src', 'script-src-attr', 'style-src-attr', 'connect-src',
    'object-src', 'base-uri', 'form-action']) {
    assert.equal(directives.get(name), "'none'", name);
  }
  assert.equal(directives.get('script-src'), "'self'");
  assert.equal(directives.get('img-src'), "'self'");
  assert.equal(directives.get('style-src'), "'self' https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/css/all.min.css");
  assert.equal(directives.get('font-src'), 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/webfonts/');
  assert.doesNotMatch(content, /unsafe-|\*|frame-ancestors|sandbox|report-uri|report-to/);
  assert.match(policyHead, /name="referrer" content="strict-origin-when-cross-origin"/);
});

test('landing and documentation apply the shared policy before resource loading', () => {
  for (const path of ['docs/index.template.html', 'docs/_layouts/default.html']) {
    const html = read(path);
    const policy = html.indexOf('{% include security-head.html %}');
    assert.ok(policy > html.indexOf('<meta charset='), path);
    assert.ok(policy < html.indexOf('<link '), path);
    assertNoInlineCode(html, path);
    assert.match(html, /integrity="sha512-[^"]+" crossorigin="anonymous"/);
  }
  assert.match(read('docs/index.template.html'), /^---\nlayout: null\n---/);
  assert.match(read('docs/_config.yml'), /- "\*\.template\.html"/);
  assert.match(read('docs/_layouts/default.html'), /<script src=".*navigation\.js.*" defer><\/script>/);
  assert.doesNotMatch(read('docs/assets/js/navigation.js'), /\.style\b|setAttribute\(['"]style/);
});

test('every legacy entrypoint keeps its destination without inline redirect code', () => {
  for (const page of redirects) {
    const html = read(`docs/${page}.html`);
    const destination = page === 'ADDING_A_SERVICE' ? '/adding-a-service.html' : `/docs/${page}`;
    assert.ok(html.includes(`redirect_to: ${destination}\n`), page);
    assert.ok(html.includes(`permalink: /${page}.html\n`), page);
    assert.doesNotMatch(html, /<script|<noscript/i, page);
  }
  assert.match(read('docs/_layouts/default.html'), /http-equiv="refresh" content="0; url={{ page.redirect_to \| relative_url }}"/);
});

test('built HTML carries the policy and has no inline executable code or styles', {
  skip: !process.env.DOCS_SITE_DIR && 'Set DOCS_SITE_DIR after building Jekyll to check rendered output',
}, () => {
  const site = resolve(process.env.DOCS_SITE_DIR);
  assert.equal(existsSync(resolve(site, 'index.template.html')), false);
  const files = readdirSync(site, { recursive: true }).filter((path) =>
    path.endsWith('.html') && !/^(?:quality|stage)[/\\]/.test(path));
  assert.ok(files.length >= redirects.length + 2, 'Expected landing, redirect and documentation pages');
  for (const path of files) {
    const html = readFileSync(resolve(site, path), 'utf8');
    assert.ok(html.includes(policyHead.trim()), path);
    assert.ok(html.indexOf('http-equiv="Content-Security-Policy"') < html.indexOf('<link '), path);
    assertNoInlineCode(html, path);
    assert.doesNotMatch(html, /{%|{{/, path);
  }
  for (const page of redirects) {
    const target = page === 'ADDING_A_SERVICE' ? '/adding-a-service.html' : `/docs/${page}`;
    assert.ok(readFileSync(resolve(site, `${page}.html`), 'utf8')
      .includes(`http-equiv="refresh" content="0; url=/Observability-Benchmarking${target}"`), page);
  }
});
