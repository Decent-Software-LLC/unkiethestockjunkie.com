#!/usr/bin/env node
/**
 * Corpus-level voice check.
 *
 * This is a BUDGET test, not an aspiration. The published corpus was audited and these
 * phrases dominate it ("As a teenager, you" opens 74% of articles; "it's essential to"
 * appears in 73%; "in this article, we'll explore" in 40%). Nothing enforces voice today,
 * which is how that happened.
 *
 * It deliberately does NOT assert zero. Rewriting 101 articles is a separate project, and a
 * suite demanding perfection would be deleted within a week as noise. Instead it pins the
 * current numbers with headroom, so:
 *   - if someone bulk-generates articles with a regressed prompt, the budget blows and CI
 *     says by how much; and
 *   - as the retrofit lands, the numbers only ever go down. Ratchet them manually when they
 *     do, so improvement is recorded rather than forgotten.
 *
 * Run `node scripts/test-voice.js --report` to print live counts without asserting.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = path.join(__dirname, '..', '_articles');
const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

/**
 * Patterns and their maximum allowed share of articles (percent).
 *
 * Baselines are MEASURED from the current corpus, not aspirational - each figure at or just
 * above where the site actually sits today. The point is to detect an increase (a regressed
 * prompt shipping bulk content), not to pass judgement on legacy text we haven't rewritten.
 * Lower these as the voice retrofit lands; the comments record today's real number.
 */
const BUDGETS = [
  { name: 'addresses the reader as a demographic', re: /\bas a teenager\b|\bas a teen\b|\bat your age\b/i, max: 85 },      // measured 82%
  { name: '"essential/crucial/paramount" (adult-tell)', re: /\b(essential|crucial|paramount)\b/i, max: 85 },               // measured 82%
  { name: 'announces the article', re: /in this article|we.ll (explore|discuss|cover)|by the end you/i, max: 70 },          // measured 65%
  { name: '"Imagine you\'re at a <venue>" opener', re: /imagine you.re (at|on) a/i, max: 55 },                              // measured 48%
  { name: 'lemonade-stand analogy', re: /lemonade stand/i, max: 20 },                                                        // measured 15%
  { name: 'music-festival analogy', re: /music festival/i, max: 20 },                                                        // measured 16%
  { name: 'rhetorical tag question hook', re: /(sounds? too good to be true|sound familiar), right\??/i, max: 5 }           // measured 1%
];

/** Positive signals: at least some articles should have these. */
const MINIMUMS = [
  { name: 'names a real company or ticker', re: /\b(?:AAPL|MSFT|TSLA|KO|DIS|NFLX|AMC|Costco|Apple|Nike|Disney|Amazon|Google|Microsoft|McDonald)/i, min: 10 },
  { name: 'contains a concrete dollar amount', re: /\$\s?\d/, min: 40 },
  { name: 'states investing involves risk', re: /not financial advice|investing involves risk|educational purposes only/i, min: 95 }
];

const reportOnly = process.argv.includes('--report');

function bodyOf(raw) {
  const m = FENCE.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}

function main() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error(`❌ No _articles directory at ${ARTICLES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md'));
  const bodies = new Map();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8');
    bodies.set(f, bodyOf(raw));
  }

  const count = (re) => [...bodies.entries()].filter(([, b]) => re.test(b)).map(([f]) => f);
  let failed = 0;

  console.log(`\ncorpus voice — ${files.length} articles\n`);

  for (const b of BUDGETS) {
    const hits = count(b.re);
    const pct = Math.round((hits.length / files.length) * 100);
    const over = pct > b.max;
    if (over && !reportOnly) failed++;
    console.log(`  ${over ? '✗' : '✓'} ${String(pct).padStart(3)}% (budget ${b.max}%)  ${b.name}` + (over ? `  → ${hits.length} articles` : ''));
  }

  console.log('');
  for (const m of MINIMUMS) {
    const hits = count(m.re);
    const pct = Math.round((hits.length / files.length) * 100);
    const under = pct < m.min;
    if (under && !reportOnly) failed++;
    console.log(`  ${under ? '✗' : '✓'} ${String(pct).padStart(3)}% (min ${m.min}%)  ${m.name}`);
  }

  if (reportOnly) {
    console.log('\n(report mode — nothing asserted)\n');
    for (const b of BUDGETS) {
      const hits = count(b.re);
      if (!hits.length) continue;
      console.log(`  ${b.name}:`);
      hits.slice(0, 3).forEach((h) => console.log(`      ${h.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '')}`));
    }
    return;
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${failed} budget violation(s)\n`);
  console.log('If the number went UP, a regressed prompt shipped bulk content.');
  console.log('If you just improved the corpus, tighten the budget in scripts/test-voice.js.');
  console.log('');
  process.exit(failed ? 1 : 0);
}

main();
