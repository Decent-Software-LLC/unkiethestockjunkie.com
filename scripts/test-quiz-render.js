#!/usr/bin/env node
/**
 * Behaviour tests for the quiz, run against REAL built HTML.
 *
 * Why build-level rather than only source-level: an invalid-YAML options list dropped every
 * quiz from rendered output while all source tests stayed green. Only reading _site caught
 * it. This file therefore grades the component exactly as a reader's browser would.
 *
 * Skips (exit 0) when there is no build or no jsdom, so CI without the ad-hoc dependency
 * does not go red on an environment gap.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Fixture: an article that carries a quiz in scripts/quiz-content.json.
const FIXTURE = path.join(__dirname, '..', '_site', 'articles', 'paper-trading-practice-without-risk', 'index.html');
const QUIZ_JS = path.join(__dirname, '..', 'assets', 'js', 'quiz.js');

function skip(reason) {
  console.log('\nquiz render\n');
  console.log(`  - skipped: ${reason}`);
  console.log('\n0 passed, 0 failed\n');
  process.exit(0);
}

if (!fs.existsSync(FIXTURE)) skip('no _site build found (run `npm run build` first)');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  skip('jsdom not installed (ad-hoc dev dependency)');
}

const html = fs.readFileSync(FIXTURE, 'utf8');
const quizJs = fs.readFileSync(QUIZ_JS, 'utf8');

let passed = 0;
let failed = 0;
const test = (name, cond) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
};

const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));

/** Which index the page claims is right — read from the DOM rather than assumed, so the
 *  test follows quiz-content.json instead of freezing a snapshot of it. */
const correctIndex = (q) => parseInt(q.getAttribute('data-correct'), 10);
const otherIndex = (q) => (correctIndex(q) === 0 ? 1 : 0);
const tick = () => new Promise((r) => setTimeout(r, 20));
const load = () => {
  const w = new JSDOM(html, { runScripts: 'outside-only' }).window;
  w.eval(quizJs);
  return w.document;
};

(async () => {
  console.log('\nquiz render\n');

  // --- correct answer -----------------------------------------------------
  {
    const d = load();
    const q = d.querySelectorAll('.quiz-question')[0];
    const opts = q.querySelectorAll('.quiz-option');
    const c = correctIndex(q);
    click(opts[c]);
    await tick();
    test('correct pick marked is-correct', opts[c].classList.contains('is-correct'));
    test('feedback affirms without lecturing', /nailed/i.test(q.querySelector('.quiz-feedback').textContent));
    test('explanation revealed after answering', !q.querySelector('.quiz-why').hidden);
    test('all options disabled after answering', Array.from(opts).every((o) => o.disabled));
  }

  // --- wrong answer -------------------------------------------------------
  {
    const d = load();
    const q = d.querySelectorAll('.quiz-question')[0];
    const opts = q.querySelectorAll('.quiz-option');
    const wIdx = otherIndex(q);
    const cIdx = correctIndex(q);
    click(opts[wIdx]);
    await tick();
    test('wrong pick marked is-wrong', opts[wIdx].classList.contains('is-wrong'));
    test('correct option also revealed on a miss', opts[cIdx].classList.contains('is-correct'));
    test('explanation shown either way', !q.querySelector('.quiz-why').hidden);
    test('soft wording (not "Wrong!")', /not quite/i.test(q.querySelector('.quiz-feedback').textContent));
  }

  // --- locking ------------------------------------------------------------
  {
    const d = load();
    const q = d.querySelectorAll('.quiz-question')[0];
    const opts = q.querySelectorAll('.quiz-option');
    const wIdx = otherIndex(q);
    const cIdx = correctIndex(q);
    click(opts[wIdx]);
    await tick();
    const before = q.querySelector('.quiz-feedback').textContent;
    click(opts[cIdx]);
    await tick();
    test(
      'locking works: second click changes neither marks nor feedback',
      opts[wIdx].classList.contains('is-wrong') && opts[cIdx].classList.contains('is-correct') &&
        q.querySelector('.quiz-feedback').textContent === before
    );
  }

  // --- accessibility / progressive enhancement ---------------------------
  {
    const d = new JSDOM(html).window.document; // no scripts at all
    const prompts = Array.from(d.querySelectorAll('.quiz-prompt')).map((p) => p.textContent.trim());
    test('questions readable without JavaScript', prompts.length === 2 && prompts[0].length > 30);
    test('noscript hint present', /Turn on JavaScript/.test(d.querySelector('section.quiz').innerHTML));
    test('feedback region is aria-live', !!d.querySelector('.quiz-feedback[aria-live="polite"]'));
    test('options are real buttons with pressed state', !!d.querySelector('button.quiz-option[aria-pressed]'));
    test('answer key not exposed as visible text', !/>\s*(answer|correct)\s*[:=]/i.test(d.querySelector('section.quiz').textContent));
  }

  // --- malformed data degrades -------------------------------------------
  {
    // Corrupt whichever key the page actually uses, rather than assuming "0".
    const actual = correctIndex(load().querySelector('.quiz-question'));
    const bad = html.replace(`data-correct="${actual}"`, 'data-correct="99"');
    const w = new JSDOM(bad, { runScripts: 'outside-only' }).window;
    w.eval(quizJs);
    const q = w.document.querySelectorAll('.quiz-question')[0];
    const opts = Array.from(q.querySelectorAll('.quiz-option'));
    test(
      'out-of-range answer key disables the question instead of dead-clicking',
      opts.length > 0 && opts.every((o) => o.disabled) && /skipped/i.test(q.querySelector('.quiz-feedback').textContent)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
