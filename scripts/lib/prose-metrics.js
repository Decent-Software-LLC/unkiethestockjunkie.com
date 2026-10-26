#!/usr/bin/env node
/**
 * One word-count definition for "is this page long enough".
 *
 * Three existed, and all three disagreed:
 *   - scripts/lib/candidate-gate.js     counted runs of 3+ letters, after stripping fenced code, table rows and headings
 *   - scripts/generate-article.js       counted runs of 3+ letters with NO stripping -- despite a comment above it
 *                                       promising it "must match scripts/lib/candidate-gate.js exactly"
 *   - scripts/lib/content-inventory.js  counted runs of 5+ letters, stripped tables but not headings
 *
 * Each divergence produced a distinct failure:
 *   gate vs generator -- a draft whose length came mostly from headings and comparison tables looked fine to the
 *                        retry loop and then died at the gate, buying an illustration for a page that never shipped;
 *   inventory         -- progress tables reported beginner pages at 287 words that measured 502 under the gate,
 *                        which is how a healthy corpus was briefly misdiagnosed as containing 33 thin pages and a
 *                        33-page rewrite program nearly got scheduled against nothing.
 *
 * The gate's semantics are canonical because they decide publication. Anything else reporting a length must
 * report that same length, or the number is decoration.
 */

'use strict';

// Words needing at least three letters: filters out "a", "of", "to", stray bullets, without filtering real
// short vocabulary ("cash", "risk", "bond", "sell") that carries meaning in finance prose.
const SIGNIFICANT = /[A-Za-z]{3,}/;

/** Strip what isn't prose, then count meaningful words. Callers pass article bodies; front matter is theirs to remove. */
function stripNonProse(text) {
  return String(text == null ? '' : text)
    .replace(/```[\s\S]*?```/g, ' ')                   // fenced code blocks
    .replace(/^\s*\|.*\|[ \t]*$/gm, ' ')                // table rows
    .replace(/^#{1,6}.*$/gm, ' ');                      // ATX heading lines
}

function countProseWords(text) {
  return stripNonProse(text).split(/\s+/).filter((w) => SIGNIFICANT.test(w)).length;
}

module.exports = { countProseWords, stripNonProse };
