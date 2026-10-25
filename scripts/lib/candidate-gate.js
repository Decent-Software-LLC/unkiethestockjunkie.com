#!/usr/bin/env node
// Pre-publication quality gate for machine-generated articles.
//
// WHY THIS EXISTS
// The daily generator committed straight to main and triggered a Pages build, with a
// `continue-on-error` heuristic as its only review. Two consecutive unattended articles shipped
// defects that this module now blocks: fabricated magnitudes ("Tesla sold $5 billion in carbon
// credits"), leaked front matter merged into prose, a self-referential link with a trailing hyphen,
// an off-topic inserted link, and essentially no risk framing. Green Validate Build did not help
// because Pages deploys independently of whether that workflow passes.
//
// Everything here is a pure function over text so it can be unit-tested without an API key or
// network. Callers pass the sets to compare against; nothing reads the filesystem, so a bad `ls`
// cannot silently weaken a check.
//
// Policy: heuristics are ALLOWED to reject good candidates (cost: one retry, next topic) but must
// not accept dangerous ones, because this site teaches minors about money.

const BANNED_PATTERNS = [
  { id: 'as-a-teenager', re: /\bas a (?:teenage[rs]?|teen|kid|child)\b|\bat your age\b|\bwhen you get older\b|\byoung investor\b/i },
  { id: 'meta-writing', re: /\bin this article\b|\bwe'?ll explore\b|\bby the end you'?ll\b|\blet'?s (?:break down|dive in|explore)\b|\bfirst we need to understand\b/i },
  { id: 'generic-analogy', re: /\bimagine you'?re (?:at|on|in) (?:a|an) (?:concert|amusement park|music festival|roller ?coaster|mall|pizza party|road trip|garage sale|school (?:cafeteria|fair))\b/i },
  // Unmistakable AI-isms only. Soft tells like "essential/crucial" are deliberately NOT banned here:
  // scripts/test-voice.js governs those as measured budgets (85% of articles today) because the corpus
  // legitimately uses them, and a gate stricter than the tested audit would reject correct pages.
  { id: 'hype-vocabulary', re: /\b(?:delve|game.?changer|superpower|unlock(?:ing)? the|exciting journey|it'?s important to note|trust us|embark)\b/i },
  { id: 'rhetorical-hook', re: /\bsound[s]? familiar\??\b|\bsounds too good to be true\b|\bbut what if\b|\bso, what does this all mean\??\b|\bhey there\b/i },
  { id: 'fake-social-proof', re: /\bthousands of teens\b|\bmost students\b|\bjoin our community\b|\bthousands of (?:readers|investors|younger)\b/i },
];

// Headings named after writing instructions rather than content.
const BANNED_HEADINGS = /^(introduction|conclusion|summary|key takeaways?|key concepts?|further reading|resources?|additional resources?|recommended reading|try it yourself|hands.on activity|real.world examples?|why (?:should teens|you should care|this matters to you)|hook the reader|clear definition|what is it|overview|bullet points)$/i;

// Large magnitudes must cite a source in the same sentence, otherwise reject. Small dollar figures
// are fine because they are arithmetic setups ("$10 a month"), not claims about the world.
const BIG_NUMBER = /(?:\$\s?\d[\d,]*(?:\.\d+)?\s*(?:billion|million|trillion))|(?:\b\d{2,}(?:\.\d+)?\s?%)/g;
const CITATION = /\b(?:according to|reported by|reportedly|per |says |said |estimates?|SEC|IRS|Federal Reserve|BLS|CBO|FINRA|S&P Dow Jones|Morningstar|Vanguard|Fidelity|NASDAQ\.com|company filings|prospectus|10-K|annual report)\b/i;

const REQUIRED_FM_KEYS = ['layout', 'title', 'description', 'date', 'difficulty', 'tags'];
// Floor to block thin generated pages. The prompt targets 800-1100 words; measured prose runs shorter than
// that, so the floor is deliberately below the target -- rejecting borderline-but-correct pages would
// just burn daily retries while publishing nothing.
const MIN_WORDS = 500;
const MIN_INTERNAL_LINKS = 3;

function splitDocument(src) {
  const parts = String(src).split(/^---[ \t]*$/m);
  if (parts.length < 3) return { fm: null, body: String(src) };
  return { fm: parts[1], body: parts.slice(2).join('---') };
}

function sentences(text) {
  return text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [];
}

function wordCount(text) {
  return text.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w)).length;
}

/**
 * @param {string} src full markdown including front matter
 * @param {{articleSlugs:Set<string>,guideSlugs:Set<string>,imageExists?:(p:string)=>boolean}} opts
 * @returns {{ok:boolean,problems:string[],stats:object}}
 */
function checkCandidate(src, opts) {
  const problems = [];
  const warnings = [];
  const articleSlugs = opts && opts.articleSlugs;
  const guideSlugs = opts && opts.guideSlugs;
  if (!articleSlugs || !guideSlugs) throw new Error('checkCandidate requires articleSlugs and guideSlugs sets');

  const { fm, body } = splitDocument(src);
  if (fm === null) problems.push('no front-matter fences found');

  // Front matter completeness, using the exact keys layouts depend on.
  for (const k of REQUIRED_FM_KEYS) {
    if (!(fm || '').includes(`${k}:`)) problems.push(`front matter missing ${k}:`);
  }

  // --- body hygiene -----------------------------------------------------------
  const prose = body.replace(/```[\s\S]*?```/g, ' ');
  for (const p of BANNED_PATTERNS) {
    const m = p.re.exec(prose);
    if (m) problems.push(`banned voice pattern (${p.id}): "${m[0]}"`);
  }
  for (const h of prose.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm)) {
    const text = h[1].replace(/[*_`]/g, '').trim();
    if (BANNED_HEADINGS.test(text)) problems.push(`scaffold heading: "## ${text}"`);
  }
  // Models restating metadata is the single most common leak; catch every variant.
  for (const leak of prose.matchAll(/^\s*(?:\*\s*)?(title|difficulty|tags|description|image_credit)\s*:\s*(.+)$/gim)) {
    problems.push(`metadata echoed into body: "${leak[1]}: ${leak[2].slice(0, 40)}"`);
  }
  if (/^\s*Tags:/im.test(prose)) problems.push('tags line leaked into body');
  if (/!\[/.test(body)) problems.push('markdown image embed in body (front matter carries the image)');
  // A title restated as a body line renders as a stray sentence inside the article, since the layout
  // prints front-matter title itself. Checked here as well as in the cleaner: the gate must not depend
  // on the cleaning step having happened, because generation can fail between the two.
  const fmTitleRaw = ((fm || '').match(/^title:\s*["']?(.*?)["']?\s*$/m) || [, ''])[1];
  const fmTitleNorm = fmTitleRaw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Exact whole-line equality is already the specific test; a length floor only existed to avoid matching
  // trivial strings and had to come down so short titles ("Test Article", 11 chars normalised) are covered.
  if (fmTitleNorm.length >= 8) {
    for (const line of prose.split('\n')) {
      const t = line.trim().replace(/^(?:#{1,6}\s*|\*\*)(.+?)(?:\s*\*\*)?$/, '$1');
      if (!t) continue;
      if (t.toLowerCase().replace(/[^a-z0-9]+/g, '') === fmTitleNorm) {
        problems.push(`title restated as a body line: "${t.slice(0, 60)}"`);
        break;
      }
    }
  }
  if (/<!-\s/.test(body)) problems.push('HTML comment left in output');

  // --- links ------------------------------------------------------------------
  const seen = new Set();
  for (const m of body.matchAll(/\]\((\/(articles|guides)\/([a-z0-9-]+)\/?)\)/g)) {
    const [, whole, coll, slug] = m;
    const pool = coll === 'articles' ? articleSlugs : guideSlugs;
    if (!pool.has(slug)) problems.push(`link to non-existent page ${whole}`);
    else seen.add(slug);
  }
  // Prose links are desirable but the layout already renders a Related Articles block from front matter,
  // so an article carrying >=3 resolvable related_articles has real navigation. Requiring in-prose links
  // anyway rejected good generated pages whose only sin was trusting the template -- a false positive that
  // costs a day's publication. Links that DO appear must still resolve.
  const fmRelated = (((fm || '').match(/^related_articles:[\s\S]*?(?=^[a-z_]+:|(?![\s\S]))/m) || [''])[0]
    .match(/^[ \t]+-[ \t]*\S/gm) || []).length; // each list item is one entry, bare slug or title/url pair
  if (seen.size < MIN_INTERNAL_LINKS && fmRelated < MIN_INTERNAL_LINKS) {
    problems.push(`only ${seen.size} in-prose internal link(s) and ${fmRelated} related_articles entry(ies); need at least ${MIN_INTERNAL_LINKS} of either`);
  }
  // A page linking to itself is always a generation artifact.
  const self = /\/articles\/([a-z0-9-]+)\/?\)/g;
  const fmTitleSlug = generateSlugStatic(((fm || '').match(/^title:\s*["']?(.*?)["']?\s*$/m) || [, ''])[1]);
  for (const m of body.matchAll(self)) {
    if (m[1] === fmTitleSlug || m[1].endsWith('-')) problems.push(`self-referential or malformed link slug: ${m[1]}`);
  }

  // --- substance --------------------------------------------------------------
  const w = wordCount(prose.replace(/^\s*\|.*\|$/gm, ' ').replace(/#+.*$/gm, ' '));
  if (w < MIN_WORDS) problems.push(`too short: ${w} words (need ${MIN_WORDS})`);

  const headings = (prose.match(/^\s{0,3}#{1,6}\s+\S/gm) || []).length;
  if (headings > 8) problems.push(`too many headings: ${headings} (prompt asks for 2-5)`);

  // Unsourced large numbers were the actual fabrication vector in production.
  // Numbers policy, split by failure mode observed in production.
  //
  // DOLLAR-SCALE CLAIMS ARE BLOCKING: the one real fabrication incident stated Tesla sold "$5 billion"
  // in carbon credits against a reported $1.58B, and large dollar figures are unverifiable filler a
  // model reaches for to sound authoritative. They must carry an in-sentence source.
  // PERCENTAGES ONLY WARN: legitimate pages reason illustratively ("a stock down 40% can be down
  // another 60%") and state verified history ("fell around 78% peak to trough"), none of which use
  // citation wording. Blocking those rejected 6 of 39 known-good authored pages; a gate that rejects
  // correct work gets switched off. Warnings print for the human reviewer instead, matching the
  // split documented in AGENTS.md.
  const DOLLAR_MAGNITUDE = /\$\s?[\d,]+(?:\.\d+)?\s*(?:billion|million|trillion)/i;
  // Two lexicons, because they mean different things. A hypothetical marker shows the sentence is
  // REASONING ("if $10 a month earned 7% ..."), so it neither blocks nor warns. A softener
  // ("around", "nearly", "historically") still describes the real world -- it just declines to
  // commit to precision -- so it excuses blocking while still earning a review warning.
  const HYPOTHETICAL = /\b(?:if you|you'?d|assum\w*|hypothetical|for example|e\.g\.|can be|could|might|would|should|say you|imagine)\b|"\s*[^"]{5,}"/i;
  const SOFTENER = /\b(?:around|roughly|about|approximately|nearly|more than|less than|typical\w*|historically|peak to trough)\b/i;
  const flagged = [];
  const warned = [];
  for (const s of sentences(prose)) {
    if (CITATION.test(s)) continue;
    const hypothetical = HYPOTHETICAL.test(s);
    if (DOLLAR_MAGNITUDE.test(s) && !hypothetical && !SOFTENER.test(s)) { flagged.push(s.trim().slice(0, 90)); continue; }
    BIG_NUMBER.lastIndex = 0;
    if (BIG_NUMBER.test(s) && !hypothetical) warned.push(s.trim().slice(0, 90));
  }
  if (flagged.length) problems.push(`${flagged.length} unsourced dollar magnitude(s); cite the source in the sentence or describe the relationship instead -- e.g. "${flagged[0]}"`);
  if (warned.length) for (const w of warned.slice(0, 3)) warnings.push(`verify this figure before publishing: ${w}`);

  // --- safety copy ------------------------------------------------------------
  const tail = prose.slice(-600);
  if (!/not (?:financial|investment) advice/i.test(tail)) problems.push('missing "not financial advice" close');
  if (!/\brisk\b|los(?:e|es|ing|t)\b/i.test(tail)) {
    problems.push('closing paragraph omits any risk statement');
  }

  // --- image asset ------------------------------------------------------------
  const img = (fm || '').match(/^image:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (img && opts.imageExists && !opts.imageExists(img[1])) problems.push(`front-matter image missing on disk: ${img[1]}`);

  // --- quiz -------------------------------------------------------------------
  const qText = ((fm || '').match(/^quiz:[\s\S]*?(?=^[a-z_]+:|(?![\s\S]))/m) || [''])[0];
  // Indentation matters: front-matter quizzes nest as "  - question:", which an unindented ^- match
  // silently counted as zero and rejected every good article.
  const questions = (qText.match(/^[ \t]*- question:/gm) || []);
  if (!qText) problems.push('no quiz block in front matter');
  else if (questions.length < 2) problems.push(`quiz has ${questions.length} question(s), expected >= 2`);
  // `why:` sits as its own key inside the question mapping (no leading dash), so match either shape.
  else if (!/^[ \t]*(?:-\s*)?why:/m.test(qText)) problems.push('quiz question missing an explanation ("why:")');

  return { ok: problems.length === 0, problems, warnings, stats: { words: w, internalLinks: seen.size, relatedArticles: fmRelated, headings } };
}

// Local copy to keep this module dependency-free and testable in isolation;
// kept behaviorally identical to generateSlug() in scripts/generate-article.js.
function generateSlugStatic(title) {
  return String(title).toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports = { checkCandidate, BANNED_PATTERNS, MIN_WORDS, MIN_INTERNAL_LINKS, generateSlugStatic };
