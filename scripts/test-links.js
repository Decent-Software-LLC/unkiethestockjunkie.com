#!/usr/bin/env node
/**
 * Link and asset integrity over the built site.
 *
 * Catches the failure class that no other test sees: markup pointing at something that isn't
 * there. Three of my own guides shipped an <img> for a hero SVG I had invented - every guide
 * test passed because they check front matter, anchors and external URLs, not whether local
 * assets referenced in content actually exist on disk. Same category as the `href="#"` stubs
 * that sat in /guides unnoticed for however long.
 *
 * Skips (exit 0) if there is no build; the guides suite already hard-fails on a missing build,
 * so this doesn't need to duplicate that signal.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', '_site');

if (!fs.existsSync(SITE)) {
  console.log('\nlink integrity\n');
  console.log('  - skipped: no _site build (run `npm run build`)');
  console.log('\n0 passed, 0 failed\n');
  process.exit(0);
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

const htmlFiles = walk(SITE).filter((f) => f.endsWith('.html'));

/** Resolve a site-relative URL to a file that should exist under _site. */
function resolvesTo(href) {
  if (href === '/' || href === '') return fs.existsSync(path.join(SITE, 'index.html')); // site root
  let rel = href.replace(/^\//, '').split(/[?#]/)[0];
  if (!rel) return false;
  if (/\/$/.test(rel)) rel += 'index.html';
  const direct = path.join(SITE, rel);
  return fs.existsSync(direct) || fs.existsSync(path.join(direct, 'index.html'));
}

console.log(`\nlink integrity — ${htmlFiles.length} built pages\n`);

test('no placeholder href="#" links', () => {
  const offenders = [];
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    // Ignore bare "#" inside our own quiz/share controls which are JS-driven buttons.
    const n = (html.match(/href="#"/g) || []).length;
    if (n) offenders.push(`${path.relative(SITE, f)} (${n})`);
  }
  if (offenders.length) throw new Error(`\n   ${offenders.slice(0, 10).join('\n   ')}`);
});

test('no dead internal links', () => {
  const bad = [];
  const seen = new Set();
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      const h = m[1];
      if (/^(https?:|mailto:|tel:|#|data:)/i.test(h)) continue;
      if (h === '/') continue; // logo link to the homepage - valid, and handled by the root check
      const key = `${path.relative(SITE, f)} -> ${h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!resolvesTo(h)) bad.push(key);
    }
  }
  if (bad.length) throw new Error(`\n   ${bad.slice(0, 15).join('\n   ')}`);
});

test('every referenced local asset exists on disk', () => {
  const bad = [];
  const seen = new Set();
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="((?:\/assets|assets)\/[^"]+)"/g)) {
      const s = m[1];
      if (seen.has(s)) continue;
      seen.add(s);
      const p = path.join(SITE, s.replace(/^\//, '').split(/[?#]/)[0]);
      if (!fs.existsSync(p)) bad.push(`${s}  (referenced from ${path.relative(SITE, f)})`);
    }
  }
  if (bad.length) {
    throw new Error(
      `\n   ${bad.slice(0, 15).join('\n   ')}\n   Do not reference image files that were never generated - omit the field instead.`
    );
  }
});

test('pages load css and js that exist', () => {
  const bad = [];
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script src="([^"]+)"|<link[^>]+href="([^"]+\.css)"/g)) {
      const url = m[1] || m[2];
      if (/^https?:/i.test(url)) continue;
      if (!resolvesTo(url)) bad.push(`${path.relative(SITE, f)} -> ${url}`);
    }
  }
  if (bad.length) throw new Error(`\n   ${[...new Set(bad)].slice(0, 10).join('\n   ')}`);
});

test('every page sets a title and meta description', () => {
  const bad = [];
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    const title = /<title>([^<]{3,})<\/title>/.test(html);
    const desc = /name="description" content="[^"]{15,}"/.test(html);
    if (!title || !desc) bad.push(`${path.relative(SITE, f)}${!title ? ' [no title]' : ''}${!desc ? ' [no description]' : ''}`);
  }
  if (bad.length) throw new Error(`\n   ${bad.slice(0, 12).join('\n   ')}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
