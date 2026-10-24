#!/usr/bin/env node
// Regression guard for rewrite-body.js.
//
// This tool silently deleted authored quizzes: passing --body without --quiz dropped the
// existing front-matter quiz block, because related_articles had a reuse-fallback and quiz
// did not. Several beginner articles lost their quizzes that way during voice passes.
// These tests pin the fixed behaviour so the data loss cannot come back.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rewriteBody = require('./rewrite-body.js');

const FIXTURE = fs.readdirSync(path.join(__dirname, '../_articles'))
  .find((f) => {
    const src = fs.readFileSync(path.join(__dirname, '../_articles', f), 'utf8');
    return /^quiz:/m.test(src.split(/^---[ \t]*$/m)[1] || '') && /related_articles:/.test(src);
  });

assert.ok(FIXTURE, 'need at least one committed article carrying both a quiz and related_articles');

const abs = path.join(__dirname, '../_articles', FIXTURE);
const original = fs.readFileSync(abs, 'utf8');
const origQuizCount = (original.match(/^[ \t]+- question:/gm) || []).length;
const origTitle = /^title:[ \t]*(.+)$/m.exec(original)[1].trim();
assert.ok(origQuizCount >= 1, 'fixture must carry a quiz');

const tmp = (name, text) => {
  const p = path.join(require('os').tmpdir(), name);
  fs.writeFileSync(p, text);
  return p;
};

let failures = 0;
const bodyFile = tmp('rb-body.md', 'New prose goes here.\n\n## A section\n\nClosing paragraph.\n');
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failures++; }
}

try {
  test('--body alone PRESERVES the existing quiz (the regression)', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    assert.match(doc, /^quiz:[ \t]*$/m, 'quiz key disappeared when no replacement was supplied');
    const n = (doc.match(/^[ \t]+- question:/gm) || []).length;
    assert.strictEqual(n, origQuizCount, `question count changed ${origQuizCount} -> ${n}`);
  });

  test('--body alone PRESERVES related_articles', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    assert.match(doc, /^related_articles:[ \t]*$/m, 'related_articles was dropped');
  });

  test('front matter stays immutable (title/difficulty/image)', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    assert.ok(doc.includes(origTitle), 'title changed under a body-only rewrite');
    assert.match(doc, /^difficulty:/m);
    assert.match(doc, /^image:/m);
  });

  test('body is actually replaced', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    assert.ok(doc.includes('New prose goes here.'), 'new body missing');
    assert.ok(!original.split(/^---[ \t]*$/m)[2].slice(0, 40).trim()
      || !doc.startsWith(original.split(/^---[ \t]*$/m)[2]), 'old body survived');
  });

  test('--quiz REPLACES rather than duplicates the quiz', () => {
    const q = tmp('rb-quiz.yaml',
      'quiz:\n' +
      '  - question: "Replacement question one?"\n    options: ["a", "b"]\n    answer: 0\n    why: "x"\n' +
      '  - question: "Replacement question two?"\n    options: ["a", "b"]\n    answer: 1\n    why: "y"\n');
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), { quiz: fs.readFileSync(q, 'utf8') });
    assert.strictEqual((doc.match(/^quiz:[ \t]*$/gm) || []).length, 1, 'two quiz blocks written');
    assert.strictEqual((doc.match(/^[ \t]+- question:/gm) || []).length, 2, 'wrong number of questions');
    assert.ok(doc.includes('Replacement question one?'), 'replacement quiz not applied');
    fs.unlinkSync(q);
  });

  test('--related replaces related_articles', () => {
    const r = tmp('rb-rel.yaml',
      'related_articles:\n  - title: "Substitute Article"\n    url: "/articles/substitute-article/"\n    description: "A stand-in."\n');
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'),
      { related_articles: fs.readFileSync(r, 'utf8') });
    assert.ok(doc.includes('/articles/substitute-article/'), 'replacement related not applied');
    assert.strictEqual((doc.match(/^related_articles:[ \t]*$/gm) || []).length, 1, 'duplicate related blocks');
    fs.unlinkSync(r);
  });

  test('every committed front-matter key survives a rewrite', () => {
    // Generic protection against allowlist regressions: `image_height` was once silently deleted because
    // it was not named in a list. Any key Jekyll or this site adds later must survive too.
    const keysOf = (s) => new Set((s.split(/^---[ \t]*$/m)[1].match(/^[a-z_]+:/gm) || []).map((x) => x.slice(0, -1)));
    const before = keysOf(original);
    const after = keysOf(rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {}));
    const lost = [...before].filter((k) => !after.has(k));
    assert.deepStrictEqual(lost, [], `front-matter keys dropped: ${lost.join(', ')}`);
  });

  test('round-trip is byte-for-byte idempotent', () => {
    // Re-supplying the committed body must reproduce the committed file exactly. If this fails,
    // front-matter blocks are being reordered or blank lines invented, which turns every future
    // edit of an already-done article into a noisy diff.
    const parts = original.split(/^---[ \t]*$/m);
    const body = parts.slice(2).join('---').replace(/^\n+/, '').replace(/\s+$/, '');
    const doc = rewriteBody(`_articles/${FIXTURE}`, body + '\n', {});
    // Compared trimmed: the tool intentionally normalises the file's final newline, so a committed
    // file lacking one legitimately differs by exactly that byte. Everything else must match.
    assert.strictEqual(doc.trimEnd(), original.trimEnd(), 'round-trip did not reproduce the committed bytes');
  });

  test('output parses as front matter with matching delimiters', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    const parts = doc.split(/^---[ \t]*$/m);
    assert.ok(parts.length >= 3, `expected opening+closing fences, got ${parts.length - 1}`);
    assert.ok(parts[1].trim().startsWith('layout:'), 'front matter does not begin with layout');
  });
} finally {
  fs.writeFileSync(abs, original);          // restore the real article
  fs.unlinkSync(bodyFile);
}

if (failures) {
  console.error(`\n${failures} rewrite-body test(s) failed`);
  process.exit(1);
}
console.log('\nall rewrite-body tests passed');
