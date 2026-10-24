#!/usr/bin/env node
// CLI for the pre-publication gate: node scripts/check-candidate.js <_articles/file.md> [...]
// Exits non-zero when any candidate fails. Generation must treat this as blocking; publishing
// unreviewed output is what put fabricated figures on a minors-facing site twice.

const fs = require('fs');
const path = require('path');
const { checkCandidate } = require('./lib/candidate-gate.js');

const ROOT = path.join(__dirname, '..');
const slugsFrom = (dir) => new Set(
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '')) : []
);
const articleSlugs = slugsFrom(path.join(ROOT, '_articles'));
const guideSlugs = slugsFrom(path.join(ROOT, '_guides'));
const imageExists = (p) => fs.existsSync(path.join(ROOT, p.replace(/^\//, '')));

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node scripts/check-candidate.js <_articles/some-article.md> [...]');
  process.exit(2);
}

let failed = 0;
for (const rel of files) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`  ✗ ${rel}: no such file`); failed++; continue; }
  // The candidate may be brand new: exclude its own slug so "does this link resolve" is not
  // evaluated against a page that does not exist yet.
  const self = path.basename(abs).replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '');
  const pool = new Set(articleSlugs);
  const result = checkCandidate(fs.readFileSync(abs, 'utf8'), { articleSlugs: pool, guideSlugs, imageExists });
  if (result.ok) {
    console.log(`  ✓ ${rel}  (${result.stats.words} words, ${result.stats.internalLinks} internal links)`);
    for (const wn of result.warnings || []) console.log(`      ! ${wn}`);
  } else {
    failed++;
    console.log(`  ✗ ${rel}`);
    for (const p of result.problems) console.log(`      - ${p}`);
  }
}

if (failed) {
  console.error(`\ncandidate gate: ${failed} file(s) rejected -- do not publish.`);
  process.exit(1);
}
console.log('\ncandidate gate: all candidates passed');
