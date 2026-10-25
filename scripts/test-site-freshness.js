'use strict';
/**
 * Tests for scripts/lib/site-freshness.js -- the guard that stops build-derived suites from grading old HTML.
 *
 * These run against throwaway fixture roots, never the real _site, so they are deterministic and fast. The case
 * that motivated the whole design is `touching a file without editing it stays fresh`: an earlier mtime-based
 * version reported stale on every test run because test-rewrite-body.js round-trips a real article and restores
 * it, which moves mtimes but not bytes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { checkSite, inputFiles, manifestPath, MANIFEST_REL } = require('./lib/site-freshness');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

/** Build a minimal repository-shaped directory and return its path. */
function fixture({ articles = { 'a.md': 'body a\n' }, guides = {}, extra = {}, manifest = undefined, legacyManifest = undefined, makeSite = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitefresh-'));
  const write = (rel, text) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  for (const [n, t] of Object.entries(articles)) write(`_articles/${n}`, t);
  for (const [n, t] of Object.entries(guides)) write(`_guides/${n}`, t);
  for (const [rel, t] of Object.entries(extra)) write(rel, t);
  if (makeSite) {
    fs.mkdirSync(path.join(root, '_site'), { recursive: true });
    fs.writeFileSync(path.join(root, '_site', 'index.html'), '<html>ok</html>');
    if (manifest !== undefined) {
      fs.writeFileSync(path.join(root, MANIFEST_REL), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    }
    if (legacyManifest !== undefined) {
      // Pre-move location, inside the build output. Still read, so an existing checkout keeps validating.
      fs.writeFileSync(path.join(root, '_site', '.build-manifest.json'), JSON.stringify(legacyManifest));
    }
  }
  return root;
}

/** Manifest describing exactly the current state of the fixture's inputs. */
function manifestFor(root, overrides = {}) {
  const files = {};
  for (const rel of inputFiles(root)) files[rel] = sha(fs.readFileSync(path.join(root, rel)));
  return { generatedAt: new Date().toISOString(), count: Object.keys(files).length, files: Object.assign(files, overrides) };
}

console.log('\nsite freshness\n');

test('reports missing when there is no _site at all', () => {
  const root = fixture({ makeSite: false });
  const res = checkSite({ root });
  assert(res.status === 'missing', `expected missing, got ${res.status}`);
});

test('refuses to trust an unmarked _site (built outside our pipeline)', () => {
  const root = fixture({});           // _site exists, no manifest written
  const res = checkSite({ root });
  assert(res.status === 'unmarked', `expected unmarked, got ${res.status}`);
  assert(/nothing proves/.test(res.detail), 'detail should explain why an unmarked build is untrustworthy');
});

test('fresh when the manifest matches every input byte-for-byte', () => {
  const root = fixture({ guides: { 'g.md': 'guide\n' }, extra: { '_config.yml': 'title: x\n' } });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  const res = checkSite({ root });
  assert(res.status === 'fresh', `expected fresh, got ${res.status}: ${res.detail}`);
});

test('manifest lives outside _site and both locations are understood', () => {
  // Pinning a CI failure: Jekyll runs as root in the build container, so a manifest written inside _site could not
  // be created by the following Node step (EACCES) and the whole validation chain died.
  assert(!MANIFEST_REL.startsWith('_site'), 'the primary manifest must not live in the build output');
  const root = fixture({ makeSite: false });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  // No _site at all is still untrustworthy even with a manifest present.
  assert(checkSite({ root }).status === 'missing', 'a manifest without a build proves nothing');
});

test('a manifest from the older in-_site location is still honoured', () => {
  const root = fixture({ legacyManifest: undefined });
  // Build marker written where this project used to put it (inside _site), before permissions forced the move.
  const r1 = fixture({});
  fs.mkdirSync(path.join(r1, '_site'), { recursive: true });
  fs.writeFileSync(path.join(r1, '_site', 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(r1, '_site', '.build-manifest.json'), JSON.stringify(manifestFor(r1)));
  assert(checkSite({ root: r1 }).status === 'fresh', 'legacy location must still be accepted');
  void root;
});

test('stale when one article body changed after the build', () => {
  const root = fixture({});
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  fs.writeFileSync(path.join(root, '_articles', 'a.md'), 'TOTALLY NEW CONTENT\n');
  const res = checkSite({ root });
  assert(res.status === 'stale', `expected stale, got ${res.status}`);
  assert(res.examples.some((e) => /changed _articles\/a\.md/.test(e)), `should name the changed file: ${res.examples}`);
});

test('stale when a brand-new article appears that the build never saw', () => {
  const root = fixture({});
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  fs.writeFileSync(path.join(root, '_articles', 'brand-new.md'), 'hello\n');
  const res = checkSite({ root });
  assert(res.status === 'stale', `expected stale, got ${res.status}`);
  assert(res.examples.some((e) => /^new _articles\/brand-new\.md/.test(e)), `should flag the new file: ${res.examples}`);
});

test('stale when a file the build used has been deleted', () => {
  const root = fixture({ articles: { 'a.md': 'body a\n', 'b.md': 'body b\n' } });
  const man = manifestFor(root);
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(man));
  fs.rmSync(path.join(root, '_articles', 'b.md'));
  const res = checkSite({ root });
  assert(res.status === 'stale', `expected stale, got ${res.status}`);
  assert(res.examples.some((e) => /^deleted _articles\/b\.md/.test(e)), `should flag the deletion: ${res.examples}`);
});

test('touching a file without editing it does NOT count as unbuilt work', () => {
  const original = 'body a\n';
  const root = fixture({ articles: { 'a.md': original } });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  // Same bytes, deliberately older-looking then newer mtime -- what test-rewrite-body.js effectively does.
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(root, '_articles', 'a.md'), past, past);
  fs.writeFileSync(path.join(root, '_articles', 'a.md'), original);   // mtime now, identical content
  const res = checkSite({ root });
  assert(res.status === 'fresh', `identical rewrite must stay fresh, got ${res.status}: ${res.detail}`);
});

test('corrupt manifest is treated as unmarked rather than crashing', () => {
  const root = fixture({ manifest: 'this is not json {{{' });
  const res = checkSite({ root });
  assert(res.status === 'unmarked', `expected unmarked, got ${res.status}`);
});

test('inputFiles covers content dirs and _config.yml but not scripts or caches', () => {
  const root = fixture({ extra: { 'scripts/helper.js': 'x\n', '.jekyll-cache/junk.json': '{}', 'node_modules/pkg/i.js': 'x', '_includes/nav.html': '<nav>' } });
  const rels = inputFiles(root);
  assert(rels.includes('_articles/a.md'), 'articles must be watched');
  assert(rels.includes('_includes/nav.html'), 'layouts/includes affect output and must be watched');
  assert(!rels.some((r) => r.startsWith('scripts/')), 'scripts cannot change HTML and must be ignored');
  assert(!rels.some((r) => r.includes('node_modules')), 'node_modules must be ignored');
  assert(!rels.some((r) => r.includes('.jekyll-cache')), 'build cache must be ignored');
  fs.writeFileSync(path.join(root, '_config.yml'), 'title: y\n');
  assert(inputFiles(root).includes('_config.yml'), 'config drives rendering and must be watched');
});

test('front matter-only edit still registers as stale (hashes see every byte)', () => {
  const before = '---\ntitle: "Old"\ndifficulty: beginner\n---\n\nbody\n';
  const root = fixture({ articles: { 'a.md': before } });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifestFor(root)));
  fs.writeFileSync(path.join(root, '_articles', 'a.md'), before.replace('beginner', 'advanced'));
  assert(checkSite({ root }).status === 'stale', 'a difficulty change alters rendered output and must be caught');
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) { failures.forEach((f) => console.error(`  ! ${f}`)); process.exit(1); }
