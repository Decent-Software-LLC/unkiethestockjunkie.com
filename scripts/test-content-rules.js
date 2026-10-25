'use strict';
/**
 * Tests for scripts/lib/content-rules.js -- the shared financial-claim ruleset.
 *
 * Two properties matter more than rule-by-rule matching: legitimate finance vocabulary must survive (a page cannot
 * explain the Sharpe ratio without saying "risk-free rate"), and the checkers must not be able to grow private rule
 * lists again. The last item asserts that structurally by reading the consumers' source.
 */

const fs = require('fs');
const path = require('path');
const { scanClaims, FORBIDDEN } = require('./lib/content-rules');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('\ncontent rules\n');

test('blocks a plain promise of guaranteed returns', () => {
  const { violations } = scanClaims({ text: 'This fund gives you guaranteed returns every year.', page: 'articles/x/' });
  assert(violations.length === 1, `expected 1 violation, got ${JSON.stringify(violations)}`);
  assert(/guaranteed-outcome/.test(violations[0]), 'should name the rule id');
});

test('"risk-free rate" survives -- it is the name of a benchmark input, not a promise', () => {
  const { violations } = scanClaims({
    text: 'The Sharpe Ratio subtracts the risk-free rate from expected return, then divides by volatility.',
    page: 'articles/sharpe-ratio-risk-adjusted-returns/',
  });
  assert(violations.length === 0, `term of art must not be flagged: ${JSON.stringify(violations)}`);
});

test('"risk-free returns" is still blocked in the same neighbourhood', () => {
  const { violations } = scanClaims({
    text: 'Unlike ordinary shares these are completely safe and offer risk-free returns.',
    page: 'articles/bad/',
  });
  assert(violations.length >= 1, 'the dangerous phrasing must still be caught');
});

test('scam-spotting questions about guaranteed returns are sanctioned, assertions are not', () => {
  const teaching = 'For each ad: did they name a specific guaranteed return, or use urgency language?';
  const selling = 'Our newsletter names stocks with guaranteed returns, so you get rich slowly.';
  assert(scanClaims({ text: teaching, page: 'articles/myths/' }).violations.length === 0, 'teaching question should be sanctioned');
  assert(scanClaims({ text: selling, page: 'articles/spam/' }).violations.length === 1, 'selling copy should not be sanctioned');
});

test('a quiz distractor naming the misconception is sanctioned', () => {
  const raw = '<div class="quiz"><button class="quiz-option">guaranteed profits</button>'
    + '<button class="quiz-option is-correct">Prices can fall as well as rise</button></div>';
  const text = raw.replace(/<[^>]+>/g, ' ');
  assert(scanClaims({ text, raw, page: 'articles/quiz/' }).sanctioned === 1, 'wrong-answer option should be sanctioned');
  const prose = raw.replace('class="quiz-option"', 'class="prose"');
  assert(scanClaims({ text: prose.replace(/<[^>]+>/g, ' '), raw: prose, page: 'articles/prose/' }).sanctioned === 0,
    'the same phrase outside a non-correct quiz option must not be sanctioned');
});

test('KNOWN LIMITATION: prose near fraud vocabulary is currently excused', () => {
  // The second guaranteed-outcome sanction excuses any window containing scam-spotting vocabulary ("promise",
  // "advert", "red flag"...). That is how the myths article legitimately teaches scam recognition, but it also
  // means selling copy gets waved through if fraud words happen to sit nearby. Pinned here as the observed
  // behaviour so tightening it later is a deliberate change with a failing test to prove it, not a silent drift.
  const raw = '<p>No such promise exists elsewhere.</p><p>Ours has guaranteed profits.</p>';
  const res = scanClaims({ text: raw.replace(/<[^>]+>/g, ' '), raw, page: 'articles/edge-case/' });
  assert(res.sanctioned === 1, 'documents current over-sanctioning of this shape');
});

test('"can\'t lose money" is exempt as a quiz distractor but not as prose', () => {
  // Real case: an ETF quiz uses this as the wrong answer, which is precisely the misconception readers must learn
  // to reject. The exemption follows the markup element, so the identical string in body copy still fails.
  const raw = '<button class="quiz-option">ETFs can\'t lose money</button><button class="quiz-option is-correct">They trade all day</button>';
  assert(scanClaims({ text: raw.replace(/<[^>]+>/g, ' '), raw, page: 'articles/etfs-instant-diversification-made-easy/' }).violations.length === 0,
    'distractor should pass');
  const prose = '<p>These funds are stable, so ETFs can\'t lose money over time.</p>';
  assert(scanClaims({ text: prose.replace(/<[^>]+>/g, ' '), raw: prose, page: 'articles/bad/' }).violations.length === 1,
    'the same claim in prose must be caught');
});

test('fabricated audience numbers are caught', () => {
  const { violations } = scanClaims({ text: 'Join 12,400+ readers this week.', page: 'articles/x/' });
  assert(violations.some((v) => /fabricated-audience/.test(v)), `expected fabricated-audience: ${violations}`);
});

test('checkers cannot quietly grow private rule lists again', () => {
  // Structural guard against the regression this module was created to end: verify-content and test-claims each
  // maintaining their own patterns meant whichever checker happened to run decided what shipped.
  for (const rel of ['scripts/verify-content.js', 'scripts/test-claims.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert(src.includes("require('./lib/content-rules')"), `${rel} must use the shared rules`);
    assert(!/const\s+FORBIDDEN\s*=\s*\[/.test(src), `${rel} must not define its own FORBIDDEN list`);
    assert(!/const\s+hard\s*=\s*\[/.test(src), `${rel} must not define its own crude "hard" pattern list`);
    assert(!/Sanctioned exceptions[\s\S]*?const SANCTIONS/.test(src), `${rel} must not keep private sanctions`);
  }
  assert(Array.isArray(FORBIDDEN) && FORBIDDEN.length >= 7, 'shared ruleset must stay substantial');
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
