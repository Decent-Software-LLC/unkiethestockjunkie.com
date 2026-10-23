#!/usr/bin/env node
/**
 * Tests for scripts/generate-article.js's writing brief.
 *
 * Why test a prompt at all: the prompt is what produces every future article, and its last
 * regression was invisible to every other test. It banned "Why Should Teens Care" as a
 * heading while telling the model to use "Why Teens Should Care" as an example of a good
 * heading. That contradiction is a large part of why scaffolding got published on 95% of
 * articles, and nothing failed because no one had ever asserted anything about the prompt.
 *
 * These tests assert the properties that were empirically broken (see corpus audit):
 * patronising address, meta-writing announcements, analogy cliches, fabricated proof,
 * and heading-word bans. They do not check output quality - only that the instructions
 * we know we need are actually present and not contradicted elsewhere in the same prompt.
 */

'use strict';

const assert = require('assert');
const { generateArticlePrompt, cleanArticleContent, generateMarkdownFile } = require('./generate-article.js');

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

/** Collapse runs of whitespace so wrapped template lines still match substring checks. */
const flat = (s) => s.replace(/\s+/g, ' ');

const beginner = () =>
  generateArticlePrompt({ title: 'What Is A Stock?', difficulty: 'beginner', tags: ['stocks', 'beginner'] });
const advanced = (tags = []) =>
  generateArticlePrompt({ title: 'Discounted Cash Flow', difficulty: 'advanced', tags });

console.log('\narticle prompt brief\n');

// --- the empirical failures this brief exists to stop ---------------------

test('bans patronising age address found in 74% of the corpus', () => {
  const p = flat(beginner());
  for (const phrase of ['as a teenager', 'as a teen', 'at your age', 'when you get older']) {
    assert.ok(p.includes(phrase), `prompt does not ban "${phrase}"`);
  }
});

test('bans meta-writing announced in 40% of the corpus', () => {
  const p = flat(beginner()).toLowerCase();
  for (const phrase of ['in this article', "we'll explore", 'by the end']) {
    assert.ok(p.includes(phrase.toLowerCase()), `prompt does not mention/block "${phrase}"`);
  }
});

test('bans "essential"/"crucial" which appeared in 73% of articles', () => {
  const p = beginner();
  // Scan the never-say sentence rather than one physical line: the list wraps across several
  // lines in the template, and a line-based check silently misses items past the first wrap -
  // which is how "essential" nearly escaped being asserted at all.
  const m = /Never say ([\s\S]*?)\.\s*(?:Do NOT|DO NOT|You may|Name real|$)/i.exec(flat(beginner()));
  assert.ok(m, 'no "Never say" list found');
  const neverSays = m[1].toLowerCase();
  for (const w of ['essential', 'crucial', 'trust us', 'superpower']) {
    assert.ok(neverSays.includes(w), `"${w}" not in the never-say list: ${neverSays.slice(0, 200)}`);
  }
});

test('rejects rhetorical-question hooks (the "Sounds too good to be true, right?" class)', () => {
  const p = beginner();
  assert.match(p, /rhetorical/i);
  assert.ok(p.includes('Sound familiar') || p.includes('too good to be true'), 'no named examples of the pattern');
});

test('rejects emoji, exclamation marks and "Hey there!"', () => {
  const p = beginner();
  assert.match(p, /No emoji/i);
  assert.match(p, /exclamation/i);
  assert.ok(p.includes('Hey there'), 'footer-style greeting must be banned explicitly');
});

// --- the thing that caused the original disaster --------------------------

test('no self-contradiction between banned headings and recommended headings', () => {
  // The old prompt said never write "Why Should Teens Care" then offered "Why Teens Should
  // Care" as an example heading. Models follow the concrete example over the prohibition, so
  // a contradiction like this publishes scaffolding while every other signal looks fine.
  const p = flat(beginner());
  const marker = 'Forbidden words anywhere in a heading:';
  assert.ok(p.includes(marker), 'heading ban list missing from the brief');

  const segment = p.split(marker)[1].split('Headings are earned')[0];
  const forbidden = segment
    .split(',')
    .map((x) => x.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  assert.ok(forbidden.length >= 12, 'unexpectedly short ban list: ' + forbidden.join('|'));

  const exampleHeadings = [...p.matchAll(/e\.g\.\s*"([^"]{3,60})"/g)].map((m) => m[1].toLowerCase());
  assert.ok(exampleHeadings.length >= 1, 'expected at least one worked example heading');

  for (const ex of exampleHeadings) {
    for (const bad of forbidden) {
      assert.ok(
        !ex.includes(bad),
        'prompt recommends heading "' + ex + '" while banning the word "' + bad + '"'
      );
    }
  }
});

test('every scaffolding label that shipped in production is still banned', () => {
  const p = flat(beginner());
  const required = [
    'Introduction', 'Conclusion', 'Summary', 'Key Takeaways', 'Key Concepts',
    'Further Reading', 'Try It Yourself', 'Real-World Examples', 'Why Should Teens Care'
  ];
  const missing = required.filter((w) => !new RegExp(w.replace(/[?]/g, '\\$&'), 'i').test(p));
  assert.deepStrictEqual(missing, [], `no longer banned: ${missing.join(', ')}`);
});

test('cleaner and prompt agree on the labels that actually shipped', () => {
  // The cleaner deletes labels; the prompt forbids them. Drift either way is bad: drop a word
  // from the cleaner and we publish instructions, drop it from the prompt and the cleaner is
  // doing work the model should never have asked for.
  //
  // Scope is the subset genuinely observed in the published corpus, not the cleaner's full
  // defensive list (it carries synonyms like "why care" / "main points" that never appeared,
  // and demanding them verbatim would bloat the prompt to satisfy a test).
  const OBSERVED_IN_CORPUS = [
    'introduction', 'key concepts', 'key takeaways', 'try it yourself', 'further reading',
    'real-world examples', 'what is it'
  ];
  const p = flat(beginner()).toLowerCase();
  const missing = OBSERVED_IN_CORPUS.filter((w) => !p.includes(w));
  assert.deepStrictEqual(missing, [], `shipped scaffolding no longer forbidden by the prompt: ${missing.join(', ')}`);

  // And nothing forbidden-by-the-cleaner is *encouraged* by the prompt (the original bug).
  const { INSTRUCTION_LABELS } = require('./clean-article-bodies.js');
  const examples = [...flat(beginner()).matchAll(/e\.g\. "([^"]{3,60})"/g)].map((m) => m[1].toLowerCase());
  for (const ex of examples) {
    for (const label of INSTRUCTION_LABELS) {
      assert.ok(!ex.includes(label), `prompt recommends heading "${ex}" which the cleaner deletes as "${label}"`);
    }
  }
});

// --- substance requirements ----------------------------------------------

test('demands specific cultural anchors rather than generic venues', () => {
  const p = beginner();
  // Corpus used "music festival"/"concert"/"rollercoaster" hundreds of times.
  const anchored = ['resale', 'battle pass', 'sneaker', 'ranked', 'data plan', 'McDonald'];
  const hits = anchored.filter((a) => p.toLowerCase().includes(a.toLowerCase()));
  assert.ok(hits.length >= 3, `expected several concrete analogy anchors, got: ${hits.join(', ')}`);
});

test('requires real numbers instead of vague quantifiers', () => {
  const p = beginner();
  assert.match(p, /ticker|dollar amount|real companies/i);
});

test('forbids fabrication and fake social proof', () => {
  const p = beginner();
  assert.match(p, /Nothing invented|no fabricated/i);
  assert.match(p, /studies show/i, 'must specifically block "studies show"');
  assert.match(p, /fabricated social proof|thousands of teens/i);
});

test('keeps risk disclosure (minors-facing site)', () => {
  const p = beginner();
  assert.match(p, /investing involves risk/i);
  assert.match(p, /not financial advice|financial advice/i);
});

test('asks for one concrete action sized to a reader with no income', () => {
  const p = beginner();
  assert.match(p, /paper trading/i);
  assert.match(p, /no broker account|no income|today/i);
});

// --- per-difficulty behaviour -------------------------------------------

test('beginner and advanced briefs differ meaningfully', () => {
  const b = beginner();
  const a = advanced(['valuation']);
  assert.notStrictEqual(b, a, 'difficulty has no effect on the brief');
  assert.match(b, /zero finance vocabulary/i);
  assert.match(a, /formula|the math/i);
});

test('difficulty and tags are interpolated into the prompt', () => {
  const p = generateArticlePrompt({ title: 'X', difficulty: 'intermediate', tags: ['dividends', 'income'] });
  assert.ok(p.includes('intermediate'), 'difficulty missing');
  assert.ok(p.includes('dividends') && p.includes('income'), 'tags missing');
});

test('investor context triggers on the right tag only', () => {
  const buffett = generateArticlePrompt({ title: 'X', difficulty: 'beginner', tags: ['warren-buffett'] });
  const plain = generateArticlePrompt({ title: 'X', difficulty: 'beginner', tags: ['stocks'] });
  assert.ok(buffett.includes('Buffett'), 'Buffett context missing when tagged');
  assert.ok(!plain.includes('Buffett'), 'Buffett context leaked into an untagged article');
});

test('survives hostile topic text without throwing', () => {
  // Titles come from topics.json and occasionally contain quotes/backticks/braces.
  const weird = generateArticlePrompt({
    title: 'The "Best" ${strategy} & <tags> guide',
    difficulty: 'beginner',
    tags: ['a"b', 'c`d', 'e${f}']
  });
  assert.ok(typeof weird === 'string' && weird.includes('Best'), 'template interpolation broke');
});

test('does not instruct the model to restate title/difficulty/tags in the body', () => {
  // Those render from front matter; duplicating them produced the duplicate header block.
  const p = beginner();
  assert.match(p, /no repeated title|body starts immediately/i);
});


console.log('\nfront-matter assembly (no API key needed)\n');

// These tests exist because scripts/generate-article.js could not previously be imported at
// all (main() ran on require), so nothing exercised the code that assembles a real article
// file. Three separate regressions hid behind that: a lost require for the scaffolding cleaner
// (ReferenceError only when generating), an import of pickRelatedArticles which does not exist
// in lib/related-articles (destructuring a missing export yields undefined silently), and no
// related_articles block at all - which silently deletes "Continue Learning" from every new
// page. All three are invisible without an API key unless this path is called directly.

const TOPIC = {
  title: 'Options Basics For Teens',
  description: 'Calls and puts explained without the jargon.',
  difficulty: 'beginner',
  tags: ['options', 'beginner']
};
const MODEL_BODY = '\n\n**Introduction**\n\nAn option is a contract, not a commitment.\n\n**Key Takeaways**\n\nLeverage cuts both ways.\n';

let assembled;
try {
  const cleaned = cleanArticleContent(MODEL_BODY);
  assembled = generateMarkdownFile(TOPIC, cleaned, null, new Date('2026-12-01'));
} catch (e) {
  assembled = e;
}

test('cleanArticleContent actually strips scaffolding (guards the shared-cleaner binding)', () => {
  // Was a ReferenceError: stripScaffolding referenced but never required.
  const out = cleanArticleContent(MODEL_BODY);
  assert.ok(!/\*\*Introduction\*\*/.test(out), 'scaffolding survived');
  assert.ok(out.includes('Leverage cuts both ways.'), 'real prose was removed');
});

test('generateMarkdownFile produces valid, complete front matter', () => {
  if (assembled instanceof Error) throw assembled;
  const fence = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(assembled);
  assert.ok(fence, 'no well-formed front-matter fence');
  const fm = fence[1];
  for (const k of ['layout: article', 'title:', 'description:', 'date:', 'difficulty:', 'tags:']) {
    assert.ok(fm.includes(k), `front matter missing ${k}`);
  }
});

test('new articles carry related_articles so Continue Learning renders', () => {
  // _layouts/article.html gates the block on this key existing; without it every future
  // article quietly loses its cross-links.
  if (assembled instanceof Error) throw assembled;
  assert.ok(/^related_articles:/m.test(assembled), 'no related_articles emitted');
});

test('no duplicated front-matter keys (Psych keeps only one, silently)', () => {
  if (assembled instanceof Error) throw assembled;
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(assembled)[1];
  const keys = fm
    .split('\n')
    .filter((l) => /^[a-z_]+:/.test(l))
    .map((l) => l.split(':')[0]);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepStrictEqual(dupes, [], `duplicate keys: ${[...new Set(dupes)].join(', ')}`);
});

test('generated related links point at real slugs', () => {
  if (assembled instanceof Error) throw assembled;
  const urls = [...assembled.matchAll(/url: "(\/articles\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 1, 'expected at least one related link');
  const fs = require('fs');
  const path = require('path');
  for (const u of urls) {
    const slug = u.replace(/^\/articles\//, '').replace(/\/$/, '');
    const hit = fs.readdirSync(path.join(__dirname, '..', '_articles')).some((f) => f.endsWith(`-${slug}.md`));
    assert.ok(hit, `related url has no source article: ${u}`);
  }
});

test('the generated article cannot self-reference', () => {
  if (assembled instanceof Error) throw assembled;
  const slug = 'options-basics-for-teens';
  assert.ok(
    !assembled.includes(`/articles/${slug}/`),
    'article recommends itself in its own Continue Learning block'
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
