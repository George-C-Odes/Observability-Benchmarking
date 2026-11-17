import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const policyHead = read('docs/_includes/security-head.html');
const redirects = ['ADDING_A_SERVICE', 'adding-a-service', 'architecture', 'benchmarking',
  'control-plane', 'getting-started', 'tools-technologies'];

function* elements(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield* elements(child);
  // Keep template contents subject to the same policy if later instantiated.
  if (node.content) yield* elements(node.content);
}

function assertNoInlineCode(html, name) {
  for (const node of elements(parse(html))) {
    assert.notEqual(node.tagName.toLowerCase(), 'style', name);
    for (const attr of node.attrs) {
      const attrName = attr.name.toLowerCase();
      assert.ok(attrName !== 'style' && !attrName.startsWith('on'), name);
    }
    if (node.tagName.toLowerCase() !== 'script') continue;
    assert.equal(node.namespaceURI, 'http://www.w3.org/1999/xhtml', name);
    const attrs = new Map(node.attrs.map(({ name, value }) => [name, value]));
    const body = node.childNodes.map((child) => child.value ?? '').join('');
    if (attrs.get('type')?.trim().toLowerCase() === 'application/ld+json') {
      JSON.parse(body); // SEO metadata is an inert data block, not executable code.
    } else {
      assert.ok(attrs.get('src')?.trim(), name);
      assert.equal(body.trim(), '', name);
    }
  }
}

test('HTML inspection rejects executable scripts despite browser-tolerated syntax', () => {
  for (const html of [
    '<script>alert(1)</script >',
    '<ScRiPt>alert(1)</ScRiPt\t\n>',
    '<script>alert(1)</script data-end="yes">',
    '<script>alert(1)</script/>',
    '<script>alert(1)',
    '<script src="/navigation.js"/>alert(1)</script>',
    '<script src="/navigation.js">alert(1)</script >',
    '<script data-src="/navigation.js"></script>',
    '<script src="" src="/navigation.js"></script>',
    '<script src="   "></script>',
    '<script data-type="application/ld+json">{"key": 1}</script>',
    '<script title=\'type="application/ld+json"\'>{"key": 1}</script>',
    '<script title=">" src="/navigation.js">alert(1)</script >',
    '<template><script>alert(1)</script ></template>',
    '<svg><script type="application/ld+json">{"key": 1}</script></svg>',
    '<!-- comment --!><script>alert(1)</script >',
  ]) {
    assert.throws(() => assertNoInlineCode(html, html), assert.AssertionError, html);
  }
});

test('HTML inspection rejects parsed inline styles and event attributes', () => {
  for (const html of [
    '<STYLE>body { color: red; }</STYLE>',
    '<div STYLE="color:red"></div>',
    '<img src="/logo.png" OnError=alert(1)>',
    '<template><div onclick="alert(1)"></div></template>',
    '<svg onload="alert(1)"></svg>',
    '<script src="/navigation.js" onload="alert(1)"></script>',
    '<script type="application/ld+json" onclick="alert(1)">{}</script>',
  ]) {
    assert.throws(() => assertNoInlineCode(html, html), assert.AssertionError, html);
  }
});

test('HTML inspection preserves external scripts, JSON-LD and inert text', () => {
  for (const html of [
    '<script src="/navigation.js" defer></script>',
    "<SCRIPT SRC='/navigation.js'> \n </SCRIPT >",
    '<script src=/navigation.js></script>',
    '<script title=">" src="/navigation.js"></script>',
    '<script type="application/ld+json">{"name":"<script>"}</script >',
    "<script TYPE='application/ld+json'>{}</script>",
    '<template><script src="/navigation.js"></script></template>',
    '<!-- <script>alert(1)</script><style>body{}</style> onload="alert(1)" -->',
    '<pre>&lt;script&gt;alert(1)&lt;/script&gt; style="color:red"</pre>',
    '<div title=\'<script>alert(1)</script> onload="alert(1)"\'></div>',
  ]) {
    assertNoInlineCode(html, html);
  }
  assert.throws(() => assertNoInlineCode(
    '<script type="application/ld+json">invalid JSON</script >', 'invalid JSON-LD'), SyntaxError);
});

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
