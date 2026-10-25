#!/usr/bin/env node
/**
 * Financial-claims guard for a site read by minors.
 *
 * Enforces what the project constraints actually require: no fabricated social proof ("Join
 * 1,000+ readers"), no guaranteed outcomes, nothing that reads as advice rather than
 * education. COPPA-adjacent territory; overstating certainty about money to a teenager is the
 * harm this site exists to avoid causing.
 *
 * Two classes of hit are sanctioned by name below, because both first fired as false
 * positives and were verified by hand:
 *   - Quiz DISTRACTORS legitimately contain the wrong idea ("Guaranteed profits" appears in
 *     an option a student must NOT pick, and the graded-correct option says judgement).
 *   - Historical prose about William O'Neil's book reaching "thousands of investors" is a
 *     claim about a 20th-century author, not our audience size.
 * Sanctions are per-pattern-and-location, not blanket: narrowing the blast radius means a new
 * violation elsewhere still fails. If you add one, write down why you believe it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', '_site');
// Rules live in scripts/lib/content-rules.js, shared with scripts/verify-content.js. Keeping a second copy here
// is how the two checkers drifted: each flagged things the other missed, so which checker ran decided what shipped.
const { scanClaims } = require('./lib/content-rules');

// A stale _site used to be graded as if it were current: the only guard was existence, so suites reported
// every assertion passing against HTML generated before the content being checked existed.
require('./lib/site-freshness').requireFreshSite('financial claims');



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

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

console.log('\nfinancial claims (built output)\n');

const pages = walk(SITE).filter((f) => f.endsWith('.html'));
const violations = [];
let sanctionedCount = 0;

for (const f of pages) {
  const rel = path.relative(SITE, f);
  const raw = fs.readFileSync(f, 'utf8');
  // Test visible text only: strip tags/comments/scripts so CSS content strings and code
  // comments don't trip rules meant for prose a teenager reads.
  const visible = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const text = visible.replace(/<[^>]+>/g, ' ');

  const scan = scanClaims({ text, raw, page: rel });
  violations.push(...scan.violations);
  sanctionedCount += scan.sanctioned;
}

test(`no unsanctioned financial claims across ${pages.length} pages`, () => {
  if (violations.length) throw new Error(`\n   ${violations.slice(0, 12).join('\n   ')}`);
});

test('every disclaimer-bearing page keeps its disclaimer', () => {
  const missing = [];
  for (const f of pages) {
    const rel = path.relative(SITE, f);
    if (!(rel.startsWith('articles/') || rel.startsWith('guides/') || rel.startsWith('screeners/'))) continue;
    const html = fs.readFileSync(f, 'utf8');
    if (!/educational purposes only|not financial advice|educational purpose only/i.test(html)) {
      missing.push(rel);
    }
  }
  if (missing.length) throw new Error(`\n   no disclaimer: ${missing.slice(0, 10).join('\n   ')}`);
});

if (sanctionedCount) console.log(`  (${sanctionedCount} matched-but-sanctioned occurrence(s), see SANCTIONS in scripts/lib/content-rules.js)`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
