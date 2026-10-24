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

if (!fs.existsSync(SITE)) {
  console.log('\nfinancial claims\n');
  console.log('  - skipped: no _site build (run `npm run build`)');
  console.log('\n0 passed, 0 failed\n');
  process.exit(0);
}

const FORBIDDEN = [
  { id: 'fabricated-audience', re: /join \d[\d,]*\+|thousands of (?:readers|teens|students)|most students (?:invest|agree)/i, why: 'invented social proof on a site with no analytics to back it' },
  { id: 'guaranteed-outcome', re: /\bguarantee[ds]? (?:your )?(?:returns?|profits?|gains?|success)\b/i, why: 'no investment outcome can be guaranteed' },
  { id: 'risk-free', re: /\b(?:completely safe|zero risk|risk[- ]free (?:returns?|growth|gains?))\b/i, why: 'contradicts the required risk disclosure' },
  { id: 'get-rich', re: /\bget rich (?:quick|fast)\b|\bsecret[s]? to (?:wealth|riches)\b/i, why: 'the exact framing the site argues against' },
  { id: 'promised-wealth', re: /\bwill make you (?:wealthy|rich)\b/i, why: 'predictive claim about a reader\'s finances' },
  { id: 'tax-free-promise', re: /\btax[- ]free (?:returns?|gains?|growth)\b/i, why: 'custodial accounts are taxable; this would mislead' },
  { id: 'ai-selfreference', re: /^\s*(?:As an AI|I cannot assist|Language model)/im, why: 'generator leakage reached production once already' }
];

/** Sanctioned exceptions: pattern id -> predicate(pagePath, matchedText) => boolean. */
const SANCTIONS = {
  'guaranteed-outcome': (page, match, context) => {
    // A quiz wrong-answer deliberately states the misconception, which is the whole point of a
    // distractor. Scoped tightly: find the <button> the phrase sits inside and require it to be
    // an option that is NOT marked correct. A broad window test would also sanction the phrase
    // appearing in body prose.
    if (!page.startsWith('articles/')) return false; // NB: rel has no leading slash
    if (!context) return false;
    const at = context.lastIndexOf(match.replace(/\s+/g, ' ').trim().slice(0, 12));
    const before = at === -1 ? context : context.slice(0, at);
    const lastBtn = before.lastIndexOf('<button');
    // Must not return early when there is no <button>: prose contexts (the warning case below)
    // legitimately have none, and an early exit here silently disabled that branch.
    if (lastBtn !== -1) {
      const btnTag = before.slice(lastBtn, before.indexOf('>', lastBtn) + 1);
      if (/class="[^"]*quiz-option/.test(btnTag) && !btnTag.includes('is-correct')) return true;
    }

    // Second sanctioned case: teaching readers to recognise a scam requires naming the scam's
    // phrasing, so an article asking whether an ad "named a specific guaranteed return" is doing
    // the right thing, not making a promise. Sanction only interrogative or fraud-vocabulary
    // context, and refuse it if the same window also asserts availability -- that combination is
    // the genuinely harmful case and must still fail.
    if (!context) return false;
    const at2 = context.lastIndexOf(match.replace(/\s+/g, ' ').trim().slice(0, 12));
    const around = context.slice(Math.max(0, at2 - 220), at2 + 280);
    const warningContext = /[?]/.test(around) ||
      /\b(?:did they|do they|whether|ask yourself|watch for|red flag|scam|advert|promis)/i.test(around);
    const asserting = /\b(?:you (?:get|will get|receive)|we (?:offer|guarantee)|it (?:guarantees|offers))\b/i.test(around);
    return warningContext && !asserting;
  },

  'fabricated-audience': (page, match, context) =>
    // Prose about William O'Neil's published system, not our readership.
    page.startsWith('screeners/oneil') && /O'Neil|investors/.test(context),

};

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

  for (const rule of FORBIDDEN) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m;
    while ((m = re.exec(text))) {
      // Sanctions inspect RAW markup around the match: they ask structural questions
      // ("is this inside a non-correct quiz option?") that vanish once tags are stripped.
      // Locate the phrase in raw itself - text and raw have unrelated offsets after stripping.
      const at = raw.indexOf(m[0].replace(/\s+/g, ' ').trim());
      const contextRaw = at === -1 ? '' : raw.slice(Math.max(0, at - 500), at + 500);
      const sanction = SANCTIONS[rule.id];
      if (sanction && sanction(rel, m[0], contextRaw)) {
        sanctionedCount++;
        continue;
      }
      violations.push(`${rel}: [${rule.id}] "${m[0]}" — ${rule.why}`);
    }
  }
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

if (sanctionedCount) console.log(`  (${sanctionedCount} matched-but-sanctioned occurrence(s), see SANCTIONS in this file)`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
