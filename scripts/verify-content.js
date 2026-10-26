#!/usr/bin/env node
// Pre-flight gate for content rewrites. Run against changed articles before committing.
//
// Why this exists as a script instead of being "checked by eye": while hand-rewriting the first
// article I invented three /articles/<slug>/ URLs for pages that do not exist, and would have
// shipped them if I had trusted my own recall. Same class of error catches a minors-facing finance
// site worst of all -- an invented expense ratio or hallucinated fund name reads perfectly.
const fs = require('fs');
const { scanClaims } = require('./lib/content-rules');
const path = require('path');
const { publishedPages, nearestSlug } = require('./lib/page-registry');
const { filenameToSlug } = require('./lib/slug');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, '_articles');
const GUIDES = path.join(ROOT, '_guides');

// Broken links are the most common failure this gate catches, usually from recalling a slug instead of
// copying it -- repeatedly inventing "investing-myths-debunked-should-you-believe-the-hype" for a file
// titled simply "Investing Myths Debunked". Suggesting the closest real slug turns each miss into a
// one-second fix instead of a hunt through `ls`.
// Slug derivation, closest-match suggestions and collection separation all come from lib/page-registry.js.
// A second copy here used to be able to disagree with the gate about what "link resolves" means.
const nearest = nearestSlug;
const slugs = publishedPages();
const assets = fs.existsSync(path.join(ROOT, 'assets')) ? collectAssets(path.join(ROOT, 'assets')) : new Set();

function collectAssets(dir, acc = new Set()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectAssets(full, acc);
    else acc.add('/' + path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return acc;
}

function splitDoc(t) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(t);
  return m ? { fm: m[0], body: t.slice(m[0].length), rawFm: m[1] } : { fm: '', body: t, rawFm: '' };
}

const VOICE_TEllS = [
  [/\bas a teenager\b|\bas a teen\b|at your age\b/i, 'addresses reader as a demographic'],
  [/\bin this article\b|\bwe will explore\b|\bby the end you\b/i, 'announces the article'],
  [/\blemonade stand\b/i, 'lemonade-stand analogy'],
  [/\btrust us\b|\byoung investor\b/i, 'patronizing phrasing'],
  [/(sounds? too good to be true|sound familiar), right\??/i, 'rhetorical tag-question hook']
];

function verify(files, opts = {}) {
  const problems = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`${rel}: file missing`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    const { fm, body, rawFm } = splitDoc(text);
    const label = filenameToSlug(rel);

    // --- structure -------------------------------------------------------
    if (!fm) problems.push(`${label}: no front-matter fence`);
    for (const key of ['layout', 'title', 'description', 'date', 'difficulty', 'tags']) {
      if (rel.includes('_articles') && !new RegExp('^' + key + ':', 'm').test(fm)) problems.push(`${label}: front matter missing ${key}`);
    }
    // Duplicated keys inside front matter: Psych keeps one and drops the other silently.
    const keys = (rawFm.match(/^[a-z_]+:/gm) || []).map((k) => k.replace(':', ''));
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (dupes.length) problems.push(`${label}: duplicate front-matter keys: ${dupes.join(', ')}`);

    // --- leaks into the body --------------------------------------------
    if (/^\s*(?:difficulty|tags|image_credit|related_articles|description)\s*:/im.test(body)) problems.push(`${label}: metadata echoed in body`);
    if (/^#\s/m.test(body)) problems.push(`${label}: duplicate H1 in body (layout already renders title)`);
    if (/^\s*\*\*\s*(Introduction|Key Takeaways|Why Should Teens Care|Try It Yourself|Further Reading|Key Concepts|Conclusion|Summary)\s*\*\*\s*$/im.test(body))
      problems.push(`${label}: internal writing instruction left published`);

    // --- links ------------------------------------------------------------
    for (const m of body.matchAll(/\]\((\/(articles|guides)\/([a-z0-9-]+)\/?)\)/g)) {
      // Kept as SEPARATE sets on purpose. A merged set lets /articles/<guide-slug>/ pass while
      // 404ing in production, since Jekyll serves those paths from different collections.
      if (!slugs[m[2]].has(m[3])) {
        const hint = nearest(m[3], slugs[m[2]]);
        problems.push(`${label}: link to non-existent page ${m[1]}${hint ? ` -- closest existing slug: /${m[2]}/${hint}/` : ''}`);
      }
    }
    for (const m of fm.matchAll(/url:\s*"\/(articles|guides)\/([a-z0-9-]+)\//g)) {
      if (!slugs[m[1]].has(m[2])) problems.push(`${label}: related_articles/guide url has no source file: /${m[1]}/${m[2]}/`);
    }
    for (const m of text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      if (!assets.has(m[1])) problems.push(`${label}: asset does not exist: ${m[1]}`);
    }
    const img = /(^|\n)image:[ \t]*"([^"]+)"/.exec(fm);
    if (img && !assets.has(img[2])) problems.push(`${label}: front-matter image missing on disk: ${img[2]}`);

    // self-linking is a real bug: an article recommending itself looks fine until rendered
    const selfSlug = label;
    for (const m of body.matchAll(/\/(?:articles|guides)\/([a-z0-9-]+)\//g)) {
      if (m[1] === selfSlug) problems.push(`${label}: links to itself`);
    }

    // --- financial claims (minors-facing) ---------------------------------
    // Shared rule set with scripts/test-claims.js via scripts/lib/content-rules.js, including its context-aware
    // sanctions. This gate used to keep its own cruder list, which flagged "risk-free rate" -- the actual name of the
    // Treasury benchmark in the Sharpe ratio -- while missing rules the CI suite had refined, so which checker ran
    // decided what shipped. One definition now governs both.
    for (const msg of scanClaims({ text: body, raw: body, page: label }).violations) {
      problems.push(msg);
    }

    // --- voice (advisory unless --strict) ----------------------------------
    for (const [re, why] of VOICE_TEllS) {
      if (re.test(body) && opts.strict) problems.push(`${label}: voice tell (${why})`);
    }

    // --- quiz shape ---------------------------------------------------------
    if (/^quiz:/m.test(fm)) {
      const qCount = (fm.match(/^\s{2}- question:/gm) || []).length;
      if (qCount < 2) problems.push(`${label}: quiz has ${qCount} questions, expected >= 2`);
      const answers = [...fm.matchAll(/^\s+answer:[ \t]*(\d+)/gm)].map((x) => +x[1]);
      const optBlocks = [...fm.matchAll(/options:[ \t]*\[(.*?)\]/g)];
      optBlocks.forEach((ob, i) => {
        const n = ob[1].split(',').filter((s) => s.trim()).length;
        if (n < 2) problems.push(`${label}: quiz Q${i + 1} has ${n} options`);
        if (answers[i] !== undefined && (answers[i] < 0 || answers[i] >= n)) problems.push(`${label}: quiz Q${i + 1} answer index ${answers[i]} out of range (0..${n - 1})`);
      });
      if (answers.some((a) => !Number.isInteger(a))) problems.push(`${label}: non-integer quiz answer index`);
    }

    // --- prose linking (advisory) ------------------------------------------
    const inlineLinks = (body.match(/\]\(\/articles\//g) || []).length;
    if (opts.requireInlineLink && inlineLinks < 1) problems.push(`${label}: no inline link to another article in prose`);
  }
  return problems;
};

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const strict = process.argv.includes('--strict');
  // Untracked files count as changes. `git diff --name-only HEAD` covers edits to tracked pages but omits
  // brand-new ones -- and a newly generated article is exactly the case this gate exists for, so previously a
  // draft sitting in _articles/ before its first `git add` was checked by nobody.
  const changed = require('child_process')
    .execSync('git diff --name-only HEAD -- _articles _guides', { cwd: ROOT }).toString();
  const untracked = require('child_process')
    .execSync('git ls-files --others --exclude-standard -- _articles _guides', { cwd: ROOT }).toString();
  const files = args.length ? args : [...new Set(`${changed}
${untracked}`.split('\n').filter(Boolean))];
  if (!files.length) { console.log('verify-content: nothing changed in _articles/_guides'); process.exit(0); }
  console.log(`verify-content: checking ${files.length} file(s)${strict ? ' [strict]' : ''}`);
  const problems = verify(files, { strict, requireInlineLink: true });
  if (problems.length) {
    problems.forEach((p) => console.log('  ❌ ' + p));
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('  ✅ all checks passed');
}

module.exports = verify;
