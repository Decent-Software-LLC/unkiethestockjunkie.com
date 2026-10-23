#!/usr/bin/env node
/**
 * Tests for scripts/clean-article-bodies.js.
 *
 * This tool rewrites every article file, so the risk is not "does it run" but
 * "did it quietly eat real prose". The word-preservation tests below are the point
 * of this file; the label tests are secondary.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { cleanBody, classifyLine } = require('./clean-article-bodies.js');

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

/** Minimal article with a body. */
function article(body, extraFm = '') {
  return [
    '---',
    'layout: article',
    'title: "Understanding Compound Interest"',
    'description: "Why starting early wins."',
    'date: 2026-01-01',
    'difficulty: beginner',
    'tags: ["compound-interest", "beginner"]',
    extraFm,
    '---',
    '',
    body,
    ''
  ].join('\n');
}

const SCAFFOLD = [
  '**Introduction**',
  '**What Is It?**',
  '**Why Should Teens Care?**',
  '**Key Concepts**',
  '**Real-World Examples**',
  '**Try It Yourself**',
  '**Key Takeaways**',
  '**Further Reading**',
  '**Difficulty: Beginner**',
  '**Tags: stocks, basics, beginner**'
].join('\n\n');

console.log('\nclean-article-bodies\n');

// --- scaffolding removal --------------------------------------------------

test('removes bolded instruction headings', () => {
  const src = article(SCAFFOLD + '\n\nCompound interest makes money grow over time.');
  const { text, changes } = cleanBody(src);
  for (const label of ['Introduction', 'What Is It?', 'Key Concepts', 'Further Reading', 'Try It Yourself']) {
    assert.ok(!text.includes(`**${label}**`), `${label} survived`);
  }
  assert.ok(changes.length >= 8, `expected many removals, got ${changes.length}`);
});

test('removes ATX instruction headings too', () => {
  const src = article('## Introduction\n\nReal prose here.\n\n## Key Takeaways\n\nMore prose.');
  const { text } = cleanBody(src);
  assert.ok(!/##\s*Introduction/i.test(text));
  assert.ok(!/##\s*Key\s+Takeaways/i.test(text));
  assert.ok(text.includes('Real prose here.'));
});

test('removes dash taglines ("Introduction – Hook the Reader")', () => {
  const src = article('**Introduction – Hook the Reader**\n\nBody copy survives.');
  const { text } = cleanBody(src);
  assert.ok(!/Hook the Reader/.test(text));
  assert.ok(text.includes('Body copy survives.'));
});

test('removes the duplicated title echo at the top of the body', () => {
  const src = article('**Understanding Compound Interest**\n====================\n\nActual opening paragraph.');
  const { text, changes } = cleanBody(src);
  assert.ok(changes.some((c) => /title echo/.test(c)), 'no title echo reported');
  // Title appears once (front matter) rather than twice in body markup.
  const body = text.slice(text.indexOf('\n---', 4));
  const occurrences = (body.match(/Understanding Compound Interest/g) || []).length;
  assert.strictEqual(occurrences, 0, `title still echoed ${occurrences}x in body`);
});

test('collapses blank runs left by deletions', () => {
  const src = article('**Introduction**\n\n\n\n**Key Concepts**\n\n\n\nSome content.');
  const { text } = cleanBody(src);
  assert.ok(!/\n{3,}/.test(text.slice(text.indexOf('\n---', 4))), 'triple newlines remain');
});

// --- what must SURVIVE ----------------------------------------------------

test('keeps genuine writer-chosen section headings', () => {
  const keepers = [
    '## The Math Made Simple',
    '### The 16-Year-Old Investor',
    '### How to Start With $50',
    '## When Compounding Works Against You'
  ];
  const src = article(keepers.join('\n\n') + '\n\nParagraph.');
  const { text } = cleanBody(src);
  for (const h of keepers) assert.ok(text.includes(h), `lost real heading: ${h}`);
});

test('keeps numbered sub-topic headings', () => {
  const src = article('### 1. Short Interest\n\nText.\n\n### 2. Margin Calls\n\nMore text.');
  const { text } = cleanBody(src);
  assert.ok(text.includes('### 1. Short Interest'), 'numbered heading lost');
  assert.ok(text.includes('### 2. Margin Calls'), 'numbered heading lost');
});

test('keeps disclaimer wording (minors-facing site should over-disclose)', () => {
  const src = article(
    'Body.\n\n**Disclaimer**\n\nNot financial advice; investing involves risk.\n\n**Not Financial Advice**\n\nEducational only.'
  );
  const { text } = cleanBody(src);
  assert.ok(text.includes('Disclaimer'), 'disclaimer heading removed');
  assert.ok(/Not financial advice/i.test(text), 'disclaimer prose removed');
});

test('long bolded sentences are treated as content, not scaffolding', () => {
  const long =
    '**The earlier you start investing, the more time your money has to compound and recover from downturns.**';
  const src = article(long + '\n\nFollowing paragraph.');
  const { text } = cleanBody(src);
  assert.ok(text.includes(long.trim()), 'genuine bolded sentence deleted');
});

test('front matter is never modified', () => {
  const src = article('**Introduction**\n\nProse.');
  const before = src.slice(0, src.indexOf('\n---', 4) + 4);
  const after = cleanBody(src).text.slice(0, src.indexOf('\n---', 4) + 4);
  assert.strictEqual(after, before, 'front matter changed');
});

test('idempotent: cleaning already-clean output changes nothing', () => {
  const src = article(SCAFFOLD + '\n\nReal content that must persist across passes.');
  const once = cleanBody(src).text;
  const twice = cleanBody(once);
  assert.strictEqual(twice.text, once, 'second pass altered the file');
  assert.strictEqual(twice.changes.length, 0, `second pass reported ${twice.changes.length} changes`);
});

// --- corpus-level safety -------------------------------------------------

const ARTICLES = path.join(__dirname, '..', '_articles');

test('corpus: no prose words are lost on any article', () => {
  if (!fs.existsSync(ARTICLES)) return; // unit-only environment

  const bodyOf = (s) => s.slice(s.indexOf('\n---', 4) + 4);
  const tokens = (s) =>
    (bodyOf(s).match(/[A-Za-z][A-Za-z'’-]+/g) || []).map((w) => w.toLowerCase());

  // Removed lines must be explainable as scaffolding. Import the cleaner's own label set so
  // the two cannot drift apart (an earlier copy here omitted "try it yourself" and the
  // non-ASCII-hyphen variant of "real-world examples", failing on correct behaviour).
  const { INSTRUCTION_LABELS } = require('./clean-article-bodies.js');
  const normLabel = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/[\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim();
  const LABELS = new Set(INSTRUCTION_LABELS.map(normLabel));

  function isScaffoldingLine(line) {
    const inner = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
    if (/^(difficulty|tags)\b/i.test(inner)) return true;
    const base = normLabel(inner.split(/\s+[\u2013\u2014-]\s+/)[0]);
    if (LABELS.has(base)) return true;
    // Label + up-to-two filler words ("Key Concepts to Understand").
    const head = base.split(' ').slice(0, 3).join(' ');
    return LABELS.has(head);
  }

  const offenders = [];
  for (const file of fs.readdirSync(ARTICLES)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
    const { text } = cleanBody(raw);

    const beforeLines = bodyOf(raw)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const afterSet = new Set(
      bodyOf(text)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    );

    // Every dropped line must be recognisable scaffolding (or an underline/blank).
    for (const line of beforeLines) {
      if (afterSet.has(line)) continue;
      const isUnderline = /^[=*+-]{3,}$/.test(line);
      if (isUnderline || isScaffoldingLine(line)) continue;

      // A title echo is also acceptable - compare against front matter title.
      const tm = /^title:\s*"?(.*?)"?\s*$/m.exec(raw);
      const bare = line.replace(/^[#*\s]+|[\s*]+$/g, '').trim();
      if (tm && bare.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() ===
          tm[1].toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()) {
        continue;
      }

      offenders.push(`${file}: ${JSON.stringify(line.slice(0, 60))}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `\n${offenders.length} unexplained deletions:\n  ${offenders.slice(0, 12).join('\n  ')}`
  );
});

test('corpus: published scaffolding actually disappears', () => {
  if (!fs.existsSync(ARTICLES)) return;
  const bad = [];
  for (const file of fs.readdirSync(ARTICLES)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
    const { text } = cleanBody(raw);
    const body = text.slice(text.indexOf('\n---', 4));
    if (/^\s*\*\*(Introduction|Key Concepts|Why Should Teens Care|Try It Yourself|Further Reading)\*\*\s*$/im.test(body)) {
      bad.push(file);
    }
  }
  assert.deepStrictEqual(bad, [], `scaffolding remains in ${bad.length} files: ${bad.slice(0, 5).join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
