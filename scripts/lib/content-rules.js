'use strict';
/**
 * The site's financial-claim rules, in one place.
 *
 * This file exists because two checkers used to keep their own lists. scripts/verify-content.js carried a crude
 * list (`/\brisk[- ]free\b/i`) while scripts/test-claims.js -- the one CI actually blocks on -- carried a carefully
 * scoped one plus context-aware sanctions. They disagreed in both directions: the crude list flagged the Sharpe
 * ratio's "risk-free rate", which is a term of art rather than a promise, and anything the good list caught but the
 * crude one missed would sail through the pre-commit gate. Minors-facing copy cannot depend on which checker
 * happens to run.
 *
 * Rules match against visible text; sanctions inspect the surrounding RAW markup, because the interesting
 * questions are structural ("is this phrase inside a quiz option that is not marked correct?") and that information
 * is destroyed by tag-stripping.
 */

const FORBIDDEN = [
  { id: 'fabricated-audience', re: /join \d[\d,]*\+|thousands of (?:readers|teens|students)|most students (?:invest|agree)/i, why: 'invented social proof on a site with no analytics to back it' },
  { id: 'guaranteed-outcome', re: /\bguarantee[ds]? (?:your )?(?:returns?|profits?|gains?|success)\b/i, why: 'no investment outcome can be guaranteed' },
  // Deliberately narrow. "Risk-free rate" is the actual name of the Treasury-benchmark input to the Sharpe ratio,
  // and a finance page cannot explain risk-adjusted return without it; what must never appear is a promise about
  // this site's own subject matter, so only returns/growth/gains are blocked.
  { id: 'risk-free', re: /\b(?:completely safe|zero risk|risk[- ]free (?:returns?|growth|gains?))\b/i, why: 'contradicts the required risk disclosure' },
  { id: 'get-rich', re: /\bget rich (?:quick|fast)\b|\bsecret[s]? to (?:wealth|riches)\b/i, why: 'the exact framing the site argues against' },
  { id: 'promised-wealth', re: /\bwill make you (?:wealthy|rich)\b/i, why: "predictive claim about a reader's finances" },
  { id: 'tax-free-promise', re: /\btax[- ]free (?:returns?|gains?|growth)\b/i, why: 'custodial accounts are taxable; this would mislead' },
  { id: 'cannot-lose', re: /can'?t lose money|cannot lose money|no way to lose/i, why: 'every position can lose value; promising otherwise to minors is the worst possible framing' },
  { id: 'ai-selfreference', re: /^\s*(?:As an AI|I cannot assist|Language model)/im, why: 'generator leakage reached production once already' },
];

/**
 * Is this phrase sitting inside a quiz option that is NOT the correct answer?
 *
 * Distractors must state the misconception believably or they teach nothing -- "ETFs can't lose money" is exactly
 * the wrong idea a beginner needs to be able to recognise. Judged on markup rather than a word window so the same
 * phrase in body prose still fails: the exemption belongs to the UI element, not to the sentence.
 */
function inWrongAnswerOption(match, context) {
  if (!context || !match) return false;
  const at = context.lastIndexOf(match.replace(/\s+/g, ' ').trim().slice(0, 12));
  const before = at === -1 ? context : context.slice(0, at);
  const lastBtn = before.lastIndexOf('<button');
  if (lastBtn === -1) return false;
  const btnTag = before.slice(lastBtn, before.indexOf('>', lastBtn) + 1);
  return /class="[^"]*quiz-option/.test(btnTag) && !btnTag.includes('is-correct');
}

/** Sanctioned exceptions: pattern id -> predicate(pagePath, matchedText, rawContext) => boolean. */
const SANCTIONS = {
  // Rules whose violation is a claim about outcomes get the distractor exemption; a rule like ai-selfreference does
  // not, because no legitimate rendering of generator leakage exists.
  'cannot-lose': (page, match, context) => inWrongAnswerOption(match, context),

  'guaranteed-outcome': (page, match, context) => {
    // A quiz wrong-answer deliberately states the misconception, which is the whole point of a
    // distractor. Scoped tightly: find the <button> the phrase sits inside and require it to be
    // an option that is NOT marked correct. A broad window test would also sanction the phrase
    // appearing in body prose.
    if (!context) return false;
    if (inWrongAnswerOption(match, context)) return true;

    // Second sanctioned case: teaching readers to recognise a scam requires naming the scam's
    // phrasing, so an article asking whether an ad "named a specific guaranteed return" is doing
    // the right thing, not making a promise. Sanction only interrogative or fraud-vocabulary
    // context, and refuse it if the same window also asserts availability -- that combination is
    // the genuinely harmful case and must still fail.
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

/**
 * Apply every rule to one document.
 *
 * @param {object} opts
 * @param {string} opts.text   visible text (tags stripped) -- what rules match against
 * @param {string} [opts.raw]  original markup/source around the match, used by sanctions
 * @param {string} opts.page   label for messages, e.g. "articles/foo/index.html"
 * @returns {{violations: string[], sanctioned: number}}
 */
function scanClaims({ text, raw, page }) {
  const contextSource = raw === undefined ? text : raw;
  const violations = [];
  let sanctioned = 0;
  for (const rule of FORBIDDEN) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m;
    while ((m = re.exec(text))) {
      // Sanctions need raw offsets, so relocate the phrase in raw rather than reusing the offset from
      // tag-stripped text -- the two coordinate systems diverge after stripping.
      const at = contextSource.indexOf(m[0].replace(/\s+/g, ' ').trim());
      const contextRaw = at === -1 ? '' : contextSource.slice(Math.max(0, at - 500), at + 500);
      const sanction = SANCTIONS[rule.id];
      if (sanction && sanction(page, m[0], contextRaw)) {
        sanctioned++;
        continue;
      }
      violations.push(`${page}: [${rule.id}] "${m[0]}" — ${rule.why}`);
    }
  }
  return { violations, sanctioned };
}

module.exports = { FORBIDDEN, SANCTIONS, scanClaims, inWrongAnswerOption };
