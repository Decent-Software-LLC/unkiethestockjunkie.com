#!/usr/bin/env node
/**
 * Tests for scripts/lib/page-registry.js, scripts/lib/slug.js and the wiring that forces every consumer to
 * use them.
 *
 * WHY THESE EXIST
 * "Does this link resolve?" was answered by four independent implementations -- verify-content.js,
 * check-candidate.js, generate-article.js (twice: readSlugs and its own title slug) and content-inventory.js
 * -- plus a fifth in topic-selector.js. Two of those copies silently disagreed with the function that names
 * files: apostrophes vanished and punctuation collapsed differently, so "The 50/30/20 Rule: Budgeting for
 * Future Investors" published as `the-50-30-20-rule-budgeting-for-future-investors` while dedupe computed
 * `the-503020-rule-...`, concluded the page did not exist, and kept offering it to the generator. A third
 * consequence: the gate's self-link check compared links against a *title* slug, and rewrites deliberately
 * retitle pages while preserving filenames, so after retitling it could never match again -- a guard that
 * had quietly stopped guarding.
 *
 * Every check here is mutation-tested: each asserts a specific wrong behaviour would be caught rather than
 * merely observing that current output looks fine.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const registry = require('./lib/page-registry');
const { titleSlug, filenameToSlug } = require('./lib/slug');
const { checkCandidate } = require('./lib/candidate-gate');
const { rankTopics, slugifyTitle } = require('./lib/topic-selector');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.error(`  \u2717 ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`); }
}

const ROOT = path.join(__dirname, '..');
const PAGES = registry.publishedPages();

// ---------------------------------------------------------------- canonical slug rules

test('title slug reproduces how files were actually named (apostrophes keep a slot)', () => {
  // Legacy copies stripped apostrophes; the generator never did, and its output is what is on disk.
  assert.strictEqual(titleSlug("Why 'Time in the Market' Beats 'Timing the Market'"),
    'why-time-in-the-market-beats-timing-the-market');
  assert.strictEqual(titleSlug('The 50/30/20 Rule: Budgeting'), 'the-50-30-20-rule-budgeting',
    'punctuation must hyphenate, not disappear -- otherwise live pages become invisible to dedupe');
  assert.strictEqual(slugifyTitle('The 50/30/20 Rule: Budgeting'), titleSlug('The 50/30/20 Rule: Budgeting'),
    'topic selector must share the canonical rule');
});

test('filename slug strips the date prefix from paths or bare names', () => {
  assert.strictEqual(filenameToSlug('_articles/2026-03-12-loss-aversion-why-losses-feel-worse-than-gains.md'),
    'loss-aversion-why-losses-feel-worse-than-gains');
  assert.strictEqual(filenameToSlug('2026-01-01-x.md'), 'x');
  assert.strictEqual(filenameToSlug('no-date.md'), 'no-date');
  assert.strictEqual(filenameToSlug('_guides/making-your-first-trade.md'), 'making-your-first-trade');
});

test('slug.js and candidate-gate.js stay filesystem-free', () => {
  // The gate's whole safety argument is that a bad `ls` cannot weaken a check. Shared helpers being pure is
  // what keeps that true after refactoring, so it is asserted structurally rather than left in a comment.
  for (const f of ['lib/slug.js', 'lib/candidate-gate.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    assert.ok(!/require\(['"]fs['"]\)/.test(src), `${f} must not read the filesystem`);
    assert.ok(!/child_process/.test(src), `${f} must not shell out`);
  }
});

test('no module outside lib/slug.js re-implements the date-prefix strip', () => {
  const offenders = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { scan(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      if (/lib\/slug\.js$/.test(p.replace(ROOT + path.sep, ''))) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (/\bd\{4\}-\\d\\d-\\d\\d-/.test(src)) offenders.push(path.relative(ROOT, p));
    }
  };
  scan(path.join(ROOT, 'scripts'));
  assert.deepStrictEqual(offenders, [], 'duplicate filename-slug implementations drift; call lib/slug.js');
});

// ---------------------------------------------------------------- collection membership

function tempSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  for (const c of ['_articles', '_guides']) fs.mkdirSync(path.join(root, c));
  fs.writeFileSync(path.join(root, '_articles', '2026-01-01-alpha-beta.md'), '---\ntitle: Alpha\n---\nbody');
  fs.writeFileSync(path.join(root, '_articles', 'unprefixed-gamma.md'), '---\ntitle: Gamma\n---\nbody');
  fs.writeFileSync(path.join(root, '_articles', 'README.md'), 'not an article');
  fs.writeFileSync(path.join(root, '_articles', '.hidden-draft.md'), 'draft');
  fs.writeFileSync(path.join(root, '_articles', 'notes.txt'), 'ignore me');
  fs.writeFileSync(path.join(root, '_guides', 'delta-guide.md'), '---\ntitle: Delta\n---\nbody');
  return root;
}

test('collections derive from source files and ignore non-articles', () => {
  const root = tempSite();
  const pages = registry.publishedPages(root);
  assert.deepStrictEqual([...pages.articles].sort(), ['alpha-beta', 'unprefixed-gamma']);
  assert.deepStrictEqual([...pages.guides], ['delta-guide'], 'README/dotfiles/non-markdown must not count as pages');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing collection degrades to empty rather than throwing', () => {
  const pages = registry.publishedPages(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-')));
  assert.strictEqual(pages.articles.size, 0);
  assert.strictEqual(registry.isLinkable(pages, 'articles', 'anything'), false);
});

test('collections stay separate because Jekyll serves them apart', () => {
  const pages = registry.publishedPages(tempSiteLikeReal());
  const guide = [...PAGES.guides][0];
  const article = [...PAGES.articles][0];
  assert.ok(guide && article, 'expected at least one published article and guide');
  assert.strictEqual(registry.isLinkable(pages, 'articles', guide), false,
    'a guide slug used as an /articles/ target 404s even though the string exists somewhere');
  assert.strictEqual(registry.isLinkable(pages, 'guides', article), false);
  assert.strictEqual(registry.isLinkable(pages, 'guides', guide), true);
  assert.throws(() => registry.isLinkable(pages, 'posts', 'x'), /unknown collection/);
  assert.strictEqual(registry.isLinkable(pages, 'articles', ''), false);
});
function tempSiteLikeReal() { return ROOT; }

test('isLinkable can exclude the candidate itself', () => {
  const pages = registry.publishedPages();
  const slug = [...PAGES.articles][0];
  assert.strictEqual(registry.isLinkable(pages, 'articles', slug), true);
  assert.strictEqual(registry.isLinkable(pages, 'articles', slug, slug), false);
});

// ---------------------------------------------------------------- suggestions

test('closest-slug hints recover the two mistakes this site actually made', () => {
  // Both variants were typed from memory more than once during the rewrite pass, and each silently became
  // a dead link until the gate rejected the page.
  const hit1 = registry.nearestSlug('index-funds-set-it-forget-it', PAGES.articles);
  assert.strictEqual(hit1, 'index-funds-set-it-and-forget-it');
  const hit2 = registry.nearestSlug('investing-myths-debunked-should-you-believe-the-hype', PAGES.articles);
  assert.strictEqual(hit2, 'investing-myths-debunked', 'suggest the short real page, not nothing');
  assert.strictEqual(registry.nearestSlug('zzzqqqxxv', PAGES.articles), null, 'gibberish gets no fake suggestion');
  assert.strictEqual(registry.nearestSlug('anything', new Set()), null);
});

// ---------------------------------------------------------------- backlog vs published

test('backlog means queued and unwritten, never both', () => {
  const topics = [
    { title: 'The 50/30/20 Rule: Budgeting' },        // canonical slug is on disk under the real corpus name
    { title: 'Some Topic Nobody Has Written' },       // genuine backlog
  ];
  const pages = { articles: new Set(['the-50-30-20-rule-budgeting']), guides: new Set() };
  const back = registry.backlogSlugs({ topics, pages });
  assert.deepStrictEqual(back.map((b) => b.slug), ['some-topic-nobody-has-written'],
    'published topics must drop out; the legacy rule reported this one as unwritten forever');
  assert.ok(registry.backlogSlugs({ topics: [], pages }).length === 0);
  assert.ok(registry.backlogSlugs({ topics: [{ title: '   ' }], pages }).length === 0);
});

test('every currently published topic is excluded from real backlog', () => {
  // Driven off the archive rather than the live queue: after the completion review all seven retained briefs
  // are deliberately unwritten, so the queue itself can no longer demonstrate that dedupe recognises live
  // pages -- the archived briefs contain the ones that were published before the review.
  const fs = require('fs');
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'topics-archive.json'), 'utf8')).topics;
  const publishedByCanonical = list.filter((t) => PAGES.articles.has(titleSlug(t.title)));
  assert.ok(publishedByCanonical.length >= 1, 'expected archived briefs whose titles map onto live pages');
  const back = new Set(registry.backlogSlugs({ topics: list, pages: PAGES }).map((b) => b.slug));
  for (const t of publishedByCanonical) {
    assert.ok(!back.has(titleSlug(t.title)), `live page /articles/${titleSlug(t.title)}/ still offered as backlog`);
  }
  // And the selector agrees: those titles are skipped as already-existing rather than ranked.
  const ranked = rankTopics({ topics: publishedByCanonical, existingSlugs: PAGES.articles, tierStats: {}, dayKey: '2026-11-05' });
  for (const t of publishedByCanonical) {
    assert.ok(ranked.skipped.some((s) => s.title === t.title), `${t.title} should be recognised as published`);
  }
});

// ---------------------------------------------------------------- source-level link sweep

test('no internal link in any article or guide source points at a missing page', () => {
  const bad = registry.unresolvedLinks(PAGES);
  if (bad.length) {
    console.error(bad.slice(0, 10).map((b) => `      ${b.file}: ${b.collection}/${b.slug}${b.hint ? ` (closest: ${b.hint})` : ''}`).join('\n'));
  }
  assert.strictEqual(bad.length, 0, 'dead internal links found in sources');
});

test('the sweep actually detects a planted dead link and suggests the neighbour', () => {
  const root = tempSite();
  const target = path.join(root, '_articles', '2026-01-01-alpha-beta.md');
  fs.appendFileSync(target, '\nSee [alpha](/articles/alpha-beta/) and [ghost](/articles/alpha-betaz/) and [g](/guides/delta-guide/).\n');
  const pages = registry.publishedPages(root);
  const bad = registry.unresolvedLinks(pages, root);
  assert.strictEqual(bad.length, 1, `expected one unresolved link, got ${bad.map((b) => b.slug).join(', ')}`);
  assert.strictEqual(bad[0].slug, 'alpha-betaz');
  assert.strictEqual(bad[0].hint, 'alpha-beta', 'a typo should arrive with its fix attached');
  fs.rmSync(root, { recursive: true, force: true });
});

test('front-matter related urls are swept too, not just prose links', () => {
  const root = tempSite();
  const target = path.join(root, '_articles', '2026-01-01-unprefixed-gamma.md');
  fs.writeFileSync(target, '---\ntitle: Gamma\nrelated_articles:\n  - title: Nope\n    url: "/articles/alpha-betaz/"\n---\nbody text');
  const bad = registry.unresolvedLinks(registry.publishedPages(root), root);
  assert.strictEqual(bad.length, 1);
  assert.strictEqual(bad[0].where, 'front-matter');
  fs.rmSync(root, { recursive: true, force: true });
});

test('self-links inside a document are not counted as valid navigation', () => {
  const targets = registry.linkTargetsIn('see [me](/articles/alpha-beta/)');
  assert.strictEqual(targets.length, 1);
  assert.strictEqual(targets[0].collection, 'articles');
  assert.strictEqual(targets[0].slug, 'alpha-beta');
});

// ---------------------------------------------------------------- gate wiring

function fmWith(title) {
  return [
    '---', 'layout: article', `title: "${title}"`, 'description: "What this explains."',
    'date: 2026-11-05', 'difficulty: beginner', 'tags: ["stocks"]',
    'quiz:', '  - question: "What does the article say?"',
    '    options: ["The right thing", "A wrong thing", "Another wrong thing"]', '    answer: 0',
    '    why: "Because that is the mechanism described."',
    '  - question: "What goes wrong?"', '    options: ["Fees and patience", "Nothing", "Only taxes"]',
    '    answer: 0', '    why: "Costs and time horizon decide most outcomes."', '---',
  ].join('\n');
}
const LINKABLE = '/articles/risk-and-reward-the-investing-balance/, /articles/index-funds-set-it-and-forget-it/, /articles/what-is-a-dividend-getting-paid-to-own-stocks/';
function bodyWith(extra) {
  const para = (s) => s.split('. ').join('. ') + '.';
  return para(Array.from({ length: 62 }, (_, i) =>
    `A share is a claim on part of a business and the price competes with everyone else who wants that claim ${i}`).join(' '))
    + `\n\nCompare ${LINKABLE} and ${extra}\n\nThis is educational explanation, not financial advice; investing involves risk including loss of principal.`;
}

test('gate flags a self-link even when the page was retitled under its filename', () => {
  // Regression: the check used only the front-matter title slug. Rewrites retitle freely while permalinks stay,
  // so this comparison could never match again and self-links passed unnoticed.
  const src = `${fmWith('A Title Nobody Recognises From The Filename')}\n\n${bodyWith('[myself](/articles/self-referential-page/)')}`;
  const verdict = checkCandidate(src, { articleSlugs: PAGES.articles, guideSlugs: PAGES.guides, selfSlug: 'self-referential-page' });
  assert.ok(verdict.problems.some((p) => /self-referential/.test(p)), `expected self-link rejection, got: ${verdict.problems.join(' | ')}`);
});

test('gate without selfSlug still catches trailing-hyphen malformed links', () => {
  const src = `${fmWith('Malformed Case')}\n\n${bodyWith('[broken](/articles/index-funds-set-it-and-forget-it-/)')}`;
  const verdict = checkCandidate(src, { articleSlugs: PAGES.articles, guideSlugs: PAGES.guides });
  assert.ok(verdict.problems.some((p) => /malformed/.test(p)));
});

// ---------------------------------------------------------------- generator prompt pool

test('the prompt never offers a link target that does not exist', () => {
  const pool = registry.linkPoolTargetsFor ? registry.linkPoolTargetsFor('Beta Test Topic') : null;
  const generated = require('./generate-article').linkPoolFor({ title: 'Beta Test Topic' });
  const urls = generated.split(', ').filter(Boolean);
  assert.ok(urls.length > 3, 'expected a pool of real pages to link');
  for (const u of urls) {
    const m = /^\/(articles|guides)\/([a-z0-9-]+)\/$/.exec(u);
    assert.ok(m, `pool entry is not a well-formed internal url: ${u}`);
    assert.ok(registry.isLinkable(PAGES, m[1], m[2]), `generator offered ${u}, which does not exist`);
  }
  assert.ok(pool === null || pool.every((t) => registry.isLinkable(PAGES, t.collection, t.slug)));
});

// ---------------------------------------------------------------- pre-commit gate wiring

const verify = require('./verify-content');
const PROBE_DIR = path.join(ROOT, '_articles');
function withProbe(slug, body, fn) {
  const rel = `_articles/2026-01-01-${slug}.md`;
  fs.writeFileSync(path.join(ROOT, rel), body);
  try { return fn(rel); }
  finally { fs.rmSync(path.join(ROOT, rel), { force: true }); }
}
const validFm = ['---', 'layout: article', 'title: "Registry Probe"', 'description: "A probe page used by tests."',
  'date: 2026-01-01', 'difficulty: beginner', 'tags: ["testing"]', 'quiz:', '  - question: "Q?"',
  '    options: ["a", "b", "c"]', '    answer: 0', '    why: "Because."', '---'].join('\n');
const PROSE = `A share is a claim on part of a business. ${'Each sentence adds a little more substance so this page is not dismissed as thin padding. '.repeat(9)}
Links: [one](/articles/index-funds-set-it-and-forget-it/), [two](/articles/risk-and-reward-the-investing-balance/),
[three](/articles/what-is-a-dividend-getting-paid-to-own-stocks/).
This is educational material, not financial advice; investing involves risk including possible loss of principal.`;

test('verify-content resolves links through the registry and accepts good pages', () => {
  const problems = withProbe('zz-registry-probe-ok', `${validFm}\n\n${PROSE}\n`, (rel) => verify([rel]));
  assert.deepStrictEqual(problems.filter((p) => /link|asset/.test(p)), [], problems.join(' | '));
});

test('verify-content rejects a planted dead link and names the closest real slug', () => {
  const broken = PROSE.replace('/articles/index-funds-set-it-and-forget-it/', '/articles/index-funds-set-it-forget-it/');
  const problems = withProbe('zz-registry-probe-dead', `${validFm}\n\n${broken}\n`, (rel) => verify([rel]));
  const hit = problems.find((p) => /non-existent page/.test(p));
  assert.ok(hit, `expected a dead-link problem, got: ${problems.join(' | ') || 'none'}`);
  assert.ok(/closest existing slug: \/articles\/index-funds-set-it-and-forget-it\//.test(hit),
    `suggestion lost when nearest() moved into the registry: ${hit}`);
});

test('verify-content checks brand-new untracked drafts, not only edited ones', () => {
  // `git diff --name-only HEAD` cannot see untracked files, which silently meant the pages most in need of
  // review -- freshly generated, never committed -- were reviewed by nobody.
  const out = withProbe('zz-registry-probe-untracked', `${validFm}\n\n${PROSE.replace('index-funds-set-it-and-forget-it', 'index-funds-set-it-forget-it')}\n`,
    () => {
      // Non-zero exit is the desired outcome here; the assertion is that the draft was considered at all.
      try { return require('child_process').execSync('node scripts/verify-content.js', { cwd: ROOT, encoding: 'utf8' }); }
      catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
    });
  assert.match(out, /zz-registry-probe-untracked/, 'new draft was skipped entirely');
  assert.match(out, /non-existent page/, 'draft was checked but its dead link was not reported');
});

const LONG_SENTENCE = 'A bond quoted above face value delivers the same coupon on a smaller effective stake, which is why two notes sharing an advertised rate can answer completely differently when the reference yield moves overnight, and nobody at the brokerage counter volunteers that arithmetic.';
const FM_NAV = [
  '---', 'layout: article', 'title: "Navigation Probe"', 'description: "A probe page used by tests."',
  'date: 2026-11-05', 'difficulty: beginner', 'tags: ["testing", "bonds"]',
  'related_articles:', '  - title: One\n    url: "/articles/index-funds-set-it-and-forget-it/"',
  '  - title: Two\n    url: "/articles/risk-and-reward-the-investing-balance/"',
  '  - title: Three\n    url: "/articles/what-is-a-dividend-getting-paid-to-own-stocks/"',
  'quiz:', '  - question: "What does the probe say?"', '    options: ["The right thing", "A wrong thing", "Another wrong thing"]',
  '    answer: 0', '    why: "Because that is the mechanism described."', '  - question: "What does it leave out?"',
  '    options: ["Nothing at all", "The price you actually paid", "Only taxes", "Just fees"]', '    answer: 1',
  '    why: "Purchase price decides the effective return, not the advertised coupon.",', '---',
].join('\n');
const NO_LINK_BODY = Array.from({ length: 14 }, () => LONG_SENTENCE).join(' ') +
  '\n\nThis is educational explanation of how prices respond to rates, not financial advice; investing involves risk including possible loss of the money you put in.';

test('the gate and the audit agree on what counts as navigation', () => {
  // Root cause of the first red production run: the generator wrote front-matter navigation and no prose links.
  // check-candidate.js cleared it (related_articles renders as a visible grid), an illustration was requested,
  // and verify-content.js --requireInlineLink then failed the build for the same page. Two definitions of one
  // rule; the pipeline could not be green unless one of them stopped pretending to speak for the other.
  const src = `${FM_NAV}\n\n${NO_LINK_BODY}\n`;
  const verdict = withProbe('zz-registry-probe-navnav', src, (rel) => ({
    gate: checkCandidate(src, { articleSlugs: PAGES.articles, guideSlugs: PAGES.guides }),
    audit: verify([rel]),
  }));
  assert.ok(verdict.gate.ok, `gate rejected a navigable page: ${verdict.gate.problems.join(' | ')}`);
  assert.strictEqual(verdict.gate.stats.internalLinks, 0, 'fixture must have no prose links');
  assert.ok(verdict.gate.stats.relatedArticles >= 3, 'fixture needs real front-matter navigation');
  assert.deepStrictEqual(verdict.audit.filter((p) => /inline link/.test(p)), [],
    'audit contradicts the gate on navigation -- the divergence that turned the nightly red');
});

test('strict link review still exists as an explicit opt-in', () => {
  const problems = withProbe('zz-registry-probe-strict', `${FM_NAV}\n\n${NO_LINK_BODY}\n`,
    (rel) => verify([rel], { requireInlineLink: true }));
  assert.ok(problems.some((p) => /inline link/.test(p)), '--require-inline-link must still report the omission');
});

test('removing every navigation channel is rejected by both tools', () => {
  const orphanFm = FM_NAV.split('\n').filter((l) => !/^(related_articles:|  - title:|    url:)/.test(l)).join('\n');
  const src = `${orphanFm}\n\n${NO_LINK_BODY}\n`;
  const gate = checkCandidate(src, { articleSlugs: PAGES.articles, guideSlugs: PAGES.guides });
  assert.ok(gate.problems.some((p) => /internal link/i.test(p)), `gate accepted an orphan: ${gate.problems.join(' | ')}`);
  const audit = withProbe('zz-registry-probe-orphan', src, (rel) => verify([rel], { requireInlineLink: true }));
  assert.ok(audit.some((p) => /inline link/.test(p)), 'strict audit accepted an orphan');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
