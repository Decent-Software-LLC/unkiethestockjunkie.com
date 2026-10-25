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
  // Each case rewrites the real fixture file, so reset it first; otherwise a later test comparing
  // against the bytes captured at load time would be compared against an earlier test's scratch prose.
  fs.writeFileSync(abs, original);
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
    // Exact, not trimmed: content files are normalised to a single trailing newline, so there is no legitimate
    // remaining difference. The previous comparison used trimEnd(), which quietly excused any amount of trailing
    // whitespace drift -- and had been letting 20+ files without a final newline slip past.
    assert.strictEqual(doc, original, 'round-trip did not reproduce the committed bytes');
  });

  test('output parses as front matter with matching delimiters', () => {
    const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
    const parts = doc.split(/^---[ \t]*$/m);
    assert.ok(parts.length >= 3, `expected opening+closing fences, got ${parts.length - 1}`);
    assert.ok(parts[1].trim().startsWith('layout:'), 'front matter does not begin with layout');
  });
  test('uncommitted front-matter edits survive a later rewrite', () => {
    // Regression: reading only HEAD made a second run revert an in-session quiz addition.
    const sentinel = 'SENTINEL question that only exists in the working tree?';
    const patched = original.replace(/^[ \t]+- question: .*$/m, `  - question: "${sentinel}"`);
    assert.ok(patched.includes(sentinel), 'fixture did not accept the injected sentinel');
    fs.writeFileSync(abs, patched);
    try {
      const doc = rewriteBody(`_articles/${FIXTURE}`, fs.readFileSync(bodyFile, 'utf8'), {});
      assert.ok(doc.includes(sentinel), 'working-tree quiz was reverted to the committed version');
    } finally {
      fs.writeFileSync(abs, original);
    }
  });
  const QUIZ_BLOCK = [
    'quiz:',
    '  - question: "Which line sits directly below operating income?"',
    '    options: ["Net income", "Gross profit", "Revenue", "Cost of goods sold"]',
    '    answer: 0',
    '    why: "Interest and taxes are deducted after operating income, so net income is the next rung down."',
    '',
  ].join('\n');
  const quizFile = tmp('rb-quiz.yml', QUIZ_BLOCK);

  test('front matter contaminated by a keyless quiz list cannot survive a rewrite', () => {
    // Real failure mode: an earlier caller passed a bare list, so the page carried orphan "- question:" rows with
    // no quiz: key above them. keptLines copied them into the scalar region AND appended a fresh block, leaving two
    // quizzes in invalid YAML -- which local tools accepted while Jekyll loaded no quiz at all.
    const contaminated = original.replace(/\n(?:[ \t]+- question:[\s\S]*?)(?=\n[a-z_]+:|\n---)/m, '\n')
      .replace(/^quiz:[ \t]*$/m, '- question: "Orphaned row from a lost key?"\n  options:\n    - "a"\n    - "b"\n    - "c"\n    - "d"\n  answer: 0\n  why: "orphan"');
    fs.writeFileSync(abs, contaminated);
    const doc = rewriteBody(`_articles/${FIXTURE}`, 'Fresh prose.\n', { quiz: QUIZ_BLOCK });
    const fm = doc.split(/^---[ \t]*$/m)[1];
    assert.strictEqual((fm.match(/^quiz:[ \t]*$/gm) || []).length, 1, 'exactly one quiz key');
    assert.ok(!/^-\s/m.test(fm), `no column-0 sequence debris may remain:\n${fm}`);
    assert.strictEqual((fm.match(/^ {2}- question:/gm) || []).length, 1, 'the supplied quiz, once');
    assert.ok(doc.includes(origTitle), 'identity keys must survive recovery from corruption');
  });

  test('--quiz text missing its key throws rather than publishing a quiz-less page', () => {
    const bare = QUIZ_BLOCK.split('\n').slice(1).join('\n');
    const before = fs.readFileSync(abs, 'utf8');
    assert.throws(() => rewriteBody(`_articles/${FIXTURE}`, 'Prose.\n', { quiz: bare }), /must begin with "quiz:"/);
    assert.strictEqual(fs.readFileSync(abs, 'utf8'), before, 'a rejected call must not touch the file');
  });

  test('supplying the same body and quiz twice reproduces identical bytes', () => {
    const first = rewriteBody(`_articles/${FIXTURE}`, 'Stable prose.\n', { quiz: QUIZ_BLOCK });
    fs.writeFileSync(abs, first);
    const second = rewriteBody(`_articles/${FIXTURE}`, 'Stable prose.\n', { quiz: QUIZ_BLOCK });
    assert.strictEqual(second, first, 're-supplying a file its own content must be a no-op');
  });

  fs.unlinkSync(quizFile);
  test('corpus sweep -- every article and guide round-trips byte-for-byte', () => {
    // The single-fixture version of this guarantee was blind in a way that hid a real bug for weeks: FIXTURE is
    // whichever file happens to sort first and carries a quiz, so renaming one unrelated article moved the fixture
    // and instantly exposed a junction difference no run had ever seen. Property checks over generated content have
    // to cover the corpus, not a sample chosen by accident.
    const rels = [
      ...fs.readdirSync(path.join(__dirname, '../_articles')).map((f) => `_articles/${f}`),
      ...fs.readdirSync(path.join(__dirname, '../_guides')).map((f) => `_guides/${f}`),
    ].filter((f) => f.endsWith('.md'));
    assert.ok(rels.length >= 100, `sweep must cover the corpus, saw only ${rels.length} files`);
    // Guard against a silent no-op sweep: an empty _guides directory would otherwise leave this test measuring
    // only articles while still printing a green tick.
    assert.ok(rels.some((r) => r.startsWith('_guides/')), 'sweep must include guides, whose structured front matter is where real damage happened');

    const offenders = [];
    let quizzed = 0;
    for (const rel of rels) {
      const text = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
      const { fields, body } = rewriteBody.splitDocument(text);
      if (/^quiz:[ \t]*$/m.test(fields)) quizzed++;
      const doc = rewriteBody.assembleDocument(fields, body, {});
      if (doc !== text) {
        const a = doc.split('\n'), b = text.split('\n');
        let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
        offenders.push(`${rel} @line ${i + 1}: emitted ${JSON.stringify((a[i] || '').slice(0, 50))} vs committed ${JSON.stringify((b[i] || '').slice(0, 50))}`);
      }
    }
    assert.deepStrictEqual(offenders, [], `re-supplying committed content must be a no-op:\n      ${offenders.slice(0, 6).join('\n      ')}`);
    assert.ok(quizzed >= 40, `sweep should be exercising quizzes on done articles, found ${quizzed}`);
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
