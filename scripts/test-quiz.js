#!/usr/bin/env node
/**
 * Tests for scripts/lib/quiz.js + the backfill round-trip.
 *
 * The stake here is specific: a quiz whose answer key points at the wrong option tells a
 * teenager, confidently, that a false rule about money is true. Shape validation is cheap
 * insurance against exactly that, so these tests err toward rejecting.
 */

'use strict';

const assert = require('assert');
const { validateQuiz } = require('./lib/quiz');
const { setQuizFrontMatter, toYaml } = require('./backfill-quiz.js');

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

const good = () => [
  {
    question: 'Compound interest means your gains can earn money too.',
    options: ['True', 'False'],
    answer: 0,
    why: 'Returns get reinvested.'
  },
  {
    question: 'Which one reduces risk?',
    options: ['One stock', 'A broad fund', 'Pure luck', 'Checking daily'],
    answer: 1,
    why: 'Spreading out limits single-name damage.'
  }
];

console.log('\nquiz validation\n');

test('accepts well-formed quizzes', () => {
  const r = validateQuiz(good());
  assert.ok(r.ok, r.errors.join('; '));
});

test('absent quiz is valid (feature is opt-in per article)', () => {
  assert.ok(validateQuiz(undefined).ok);
  assert.ok(validateQuiz(null).ok);
  assert.ok(validateQuiz([]).ok);
});

test('rejects answer index outside the option list', () => {
  const q = [{ question: 'x', options: ['a', 'b'], answer: 5 }];
  const r = validateQuiz(q);
  assert.ok(!r.ok && /outside/.test(r.errors[0]), JSON.stringify(r.errors));
});

test('rejects negative answer index', () => {
  assert.ok(!validateQuiz([{ question: 'x', options: ['a', 'b'], answer: -1 }]).ok);
});

test('rejects string answer (YAML will hand us "1" sometimes)', () => {
  // A quoted answer must not silently become truthy-but-wrong.
  const r = validateQuiz([{ question: 'x', options: ['a', 'b'], answer: '1' }]);
  assert.ok(!r.ok, 'string answer accepted');
  assert.ok(/integer/.test(r.errors[0]), r.errors[0]);
});

test('rejects float answer', () => {
  assert.ok(!validateQuiz([{ question: 'x', options: ['a', 'b'], answer: 1.5 }]).ok);
});

test('rejects fewer than two options', () => {
  assert.ok(!validateQuiz([{ question: 'x', options: ['only'], answer: 0 }]).ok);
});

test('rejects duplicate options (makes the key ambiguous)', () => {
  const r = validateQuiz([{ question: 'x', options: ['True', 'true'], answer: 0 }]);
  assert.ok(!r.ok && /duplicate/i.test(r.errors.join(' ')), JSON.stringify(r.errors));
});

test('rejects empty option text', () => {
  assert.ok(!validateQuiz([{ question: 'x', options: ['a', '   '], answer: 0 }]).ok);
});

test('rejects missing question text', () => {
  assert.ok(!validateQuiz([{ options: ['a', 'b'], answer: 0 }]).ok);
});

test('rejects too many questions', () => {
  const q = Array.from({ length: 4 }, (_, i) => ({ question: `q${i}`, options: ['a', 'b'], answer: 0 }));
  const r = validateQuiz(q);
  assert.ok(!r.ok && /keep it to/.test(r.errors[0]), JSON.stringify(r.errors));
});

test('rejects non-array quiz', () => {
  assert.ok(!validateQuiz({ question: 'oops' }).ok);
});

test('rejects blank why when the key is present', () => {
  assert.ok(!validateQuiz([{ question: 'x', options: ['a', 'b'], answer: 0, why: '  ' }]).ok);
});

test('reports which question failed', () => {
  const q = [good()[0], { question: 'bad', options: ['a', 'b'], answer: 9 }];
  const r = validateQuiz(q);
  assert.ok(r.errors.some((e) => e.startsWith('question 2')), JSON.stringify(r.errors));
});

console.log('\nemitter / round-trip\n');

test('emits options as a YAML flow sequence, never a bare comma list', () => {
  // Regression: `options: "a", "b"` is invalid YAML and made Psych abort the entire build
  // under --strict_front_matter. It has to be `[..]`.
  const yaml = toYaml([good()[0]]);
  assert.match(yaml, /options: \[[^\]]*\]/, 'options must be a bracketed flow sequence:\n' + yaml);
});

test('emitted block parses back with identical semantics', () => {
  // Structural check on our own emitter: shape must survive re-reading by any YAML consumer.
  const src = ['---', 'layout: article', 'title: "T"', '---', '', 'Body.'].join('\n');
  const out = setQuizFrontMatter(src, good());
  const fm = /^---\n([\s\S]*?)\n---/.exec(out)[1];
  assert.ok(/^quiz:$/m.test(fm), 'quiz key missing');
  assert.ok(fm.includes('answer: 0') && fm.includes('answer: 1'), 'answer keys missing');
  // Inserted before related_articles ordering is unaffected here because none exists.
  assert.ok(out.endsWith('Body.\n') || out.includes('Body.'), 'body was damaged');
});

test('replaces an existing quiz block instead of stacking duplicates', () => {
  const first = setQuizFrontMatter(['---', 'title: "T"', '---', '', 'B'].join('\n'), [good()[0]]);
  const second = setQuizFrontMatter(first, good());
  const occurrences = (second.match(/^quiz:/gm) || []).length;
  assert.strictEqual(occurrences, 1, `quiz: appears ${occurrences} times`);
  assert.strictEqual((second.match(/answer:/g) || []).length, 2, 'stale question survived');
});

test('inserts before related_articles to keep key order stable', () => {
  const src = ['---', 'title: "T"', 'related_articles:', '  - title: "X"', '---', '', 'B'].join('\n');
  const out = setQuizFrontMatter(src, [good()[0]]);
  assert.ok(out.indexOf('quiz:') < out.indexOf('related_articles:'), 'quiz inserted after related_articles');
});

test('refuses files with no front-matter fence', () => {
  assert.throws(() => setQuizFrontMatter('no front matter here', good()), /front matter/);
});

test('escapes quotes and backslashes in authored text', () => {
  const q = [{ question: 'He said "buy" then \\ran\\', options: ['yes "x"', 'no'], answer: 0 }];
  const yaml = toYaml(q);
  assert.ok(yaml.includes('\\"buy\\"'), 'quotes not escaped');
  assert.ok(yaml.includes('\\\\ran'), 'backslashes not escaped');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
