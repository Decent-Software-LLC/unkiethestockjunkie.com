#!/usr/bin/env node
// CLI for the pre-publication gate: node scripts/check-candidate.js <_articles/file.md> [...]
// Exits non-zero when any candidate fails. Generation must treat this as blocking; publishing
// unreviewed output is what put fabricated figures on a minors-facing site twice.

const fs = require('fs');
const path = require('path');
const { checkCandidate } = require('./lib/candidate-gate.js');
const { publishedPages } = require('./lib/page-registry.js');
const { filenameToSlug } = require('./lib/slug');

const ROOT = path.join(__dirname, '..');
const { articles: articleSlugs, guides: guideSlugs } = publishedPages();
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
  // The candidate may be brand new, so the gate takes its own slug separately: existence checks run against
  // every published page while a link pointing at the candidate itself is still reported as the artifact it is.
  const self = filenameToSlug(abs);
  const result = checkCandidate(fs.readFileSync(abs, 'utf8'), { articleSlugs, guideSlugs, imageExists, selfSlug: self });
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
