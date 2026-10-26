#!/usr/bin/env node
// Flag suspicious numeric claims in an article so a human verifies them before publishing.
//
// Why this exists as code: the generator prompt has said "Nothing invented. No fabricated
// statistics..." for weeks, and the first unattended cron run still published "Tesla sold $5 billion
// in carbon credits... added $1.6 billion to their profits" -- a figure matching no reported 2020
// number. Prose rules do not constrain a model's numbers. Only a reviewer does. This script does not
// decide what is true (it cannot); it produces the short list of claims a human must check, which is
// the difference between reviewing ~4 risky sentences per article and rereading all 700 words.
//
// Usage:
//   node scripts/review-numbers.js [_articles/file.md ...]     # default: changed vs HEAD
//   node scripts/review-numbers.js --all                        # whole corpus
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { filenameToSlug } = require('./lib/slug');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, '_articles');

// High-stakes shapes: specific companies tied to specific figures, or absolute-sounding claims.
const PATTERNS = [
  { re: /\$\s?\d[\d,.]*\s?(?:billion|million|trillion)\b/gi, why: 'large absolute figure' },
  { re: /\b(?:about|around|roughly|nearly|over|almost|more than|less than)\s+\$?\d[\d,.]*\s?(?:%|percent|billion|million)?/gi, why: 'hedged magnitude' },
  { re: /\b\d+(?:\.\d+)?%\b/g, why: 'percentage' },
  { re: /\bin (19|20)\d\d\b/g, why: 'dated event' },
  { re: /\b(?:reported|according to|studies? (?:show|find)|researchers? found|analysts? say)\b/gi, why: 'attribution without citation' },
  { re: /\bnever|always|guarantee[d]?|impossible|proven that\b/gi, why: 'absolute claim' }
];

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'$])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function review(bodyText) {
  const out = [];
  for (const sentence of sentences(bodyText)) {
    const hits = [];
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      if (p.re.test(sentence)) hits.push(p.why);
    }
    if (hits.length) out.push({ sentence, reasons: [...new Set(hits)] });
  }
  return out;
}

module.exports = { review };

if (require.main === module) {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const all = process.argv.includes('--all');
  let files;
  if (argv.length) files = argv;
  else if (all) files = fs.readdirSync(ARTICLES).filter((f) => f.endsWith('.md')).map((f) => `_articles/${f}`);
  else
    files = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', '_articles'], { cwd: ROOT })
      .toString()
      .split('\n')
      .filter(Boolean);

  if (!files.length) { console.log('review-numbers: nothing changed under _articles'); process.exit(0); }

  let total = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
    const body = m ? text.slice(m[0].length) : text;
    const items = review(body);
    const label = filenameToSlug(rel);
    console.log(`\n── ${label}: ${items.length} claim(s) needing verification`);
    total += items.length;
    // Cap output: the top-risky ones are what a reviewer will actually read.
    items.slice(0, 12).forEach((it, i) => console.log(`   ${i + 1}. [${it.reasons.join(', ')}]\n      "${it.sentence.slice(0, 190)}"`));
    if (items.length > 12) console.log(`   …and ${items.length - 12} more`);
  }
  console.log(`\n${total} claim(s) across ${files.length} file(s). Every one needs a source or should be softened.`);
}
