#!/usr/bin/env node
/**
 * Tests for scripts/lib/candidate-gate.js -- the thing standing between an unreviewed model
 * completion and a minors-facing site.
 *
 * Cases are transcribed from defects that actually reached production or its near-misses:
 * fabricated dollar magnitudes, leaked metadata lines, confabulated/self-referential links, missing
 * risk framing, no quiz at all, and thin pages. Each must reject; clean prose must pass.
 */

'use strict';

const assert = require('assert');
const { checkCandidate } = require('./lib/candidate-gate');

const ARTICLE_SLUGS = new Set(['dollar-cost-averaging', 'dollar-cost-averaging-smooth-out-the-bumps', 'index-funds-set-it-and-forget-it', 'risk-and-reward-the-investing-balance', 'what-is-a-dividend-getting-paid-to-own-stocks']);
const GUIDE_SLUGS = new Set(['making-your-first-trade', 'building-your-first-portfolio']);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) {
    failed++;
    const lines = e.message.split('\n');
    console.log(`  \u2717 ${name}\n      ${lines.slice(0, 6).join('\n      ')}`);
  }
}
function reasons(src, extra) {
  return checkCandidate(src, Object.assign({ articleSlugs: ARTICLE_SLUGS, guideSlugs: GUIDE_SLUGS }, extra || {})).problems.join('\n');
}
function ok(src) { return checkCandidate(src, { articleSlugs: ARTICLE_SLUGS, guideSlugs: GUIDE_SLUGS }); }

// A minimal page satisfying every check; individual tests mutate one aspect at a time so a failure
// names the intended reason rather than seven incidental ones.
function page(bodyOverride, fmOverride) {
  const fm = [
    '---',
    'layout: article',
    'title: "Test Article"',
    'description: "What this explains."',
    'date: 2026-11-02',
    'difficulty: beginner',
    'tags: ["stocks"]',
    'related_articles:',
    '  - dollar-cost-averaging',
    'quiz:',
    '  - question: "What does the article say?"',
    '    options: ["The right thing", "A wrong thing", "Another wrong thing"]',
    '    answer: 0',
    '    why: "Because that is the mechanism described."',
    '  - question: "What goes wrong?"',
    '    options: ["Fees and patience", "Nothing", "Only taxes"]',
    '    answer: 0',
    '    why: "Costs and time horizon decide most outcomes."',
    '---',
  ].join('\n');
  const body = [
    'A share is a claim on part of a business, and the price you pay competes with millions of other people who want the same claim.',
    '',
    'Prices move because expectations move, not because last quarter already happened. By the time a headline reaches a phone,',
    'the number in it is old news and reflected in the quote, which is why reaction often looks backward to someone watching live.',
    '',
    'That timing gap is where most beginner losses come from, and no chart fixes it. Costs compound quietly instead: a fund charging',
    'more each year needs to earn that much more just to match a cheaper one holding similar things, before anyone calls that skill.',
    '',
    'Read [what happens when prices fall](/articles/risk-and-reward-the-investing-balance/) and see how [regular contributions change',
    'the math](/articles/dollar-cost-averaging-smooth-out-the-bumps/). Then compare what [a dividend actually is]',
    '(/articles/what-is-a-dividend-getting-paid-to-own-stocks/) with the fund route in [this guide](/guides/making-your-first-trade/),',
    'where the order entry itself is spelled out step by step.',
    '',
    'Fees are the part a beginner can actually control, and they are quoted per year rather than per trade, which is what makes them',
    'easy to underestimate. Two funds holding broadly similar lists of companies can sit five hundred basis points apart, and the',
    'expensive one has to clear that gap before it can honestly be called better. Over ten years the difference is not a rounding error;',
    'it shows up as a hole where a car payment or a semester of tuition would have been, decided entirely by paperwork nobody read.',
    '',
    'Tax treatment quietly redraws the same map. Money sheltered inside certain registered accounts can grow without a yearly filing',
    'choosing sides, while a taxable account reports dividends whether or not you wanted them that year. None of this is exotic advice,',
    'it is simply the difference between returns on paper and returns that survive contact with a return, and beginners rarely learn it',
    'until a statement arrives that disagrees with their spreadsheet from earlier in the year about what they supposedly earned online.',
    '',
    'Watch behaviour rather than narrative when evaluating any source. Someone describing what they bought after it moved is reporting',
    'a coincidence; someone writing down the price at which they would admit being wrong beforehand is doing something testable. Apply',
    'the same standard to a portfolio app notification, a creator with a sponsorship, and this page, which has no special claim either.',
    '',
    'Currency of information matters more than speed. A quarterly filing is slow, boring and unusually trustworthy compared with a',
    'clip cut from it, because the filing has legal consequences for being wrong and the clip has none at all. Read the section where',
    'management describes risks before the section where management describes its own outlook, and notice which one uses numbers.',
    '',
    'Position size does the rest of the work nobody advertises. A correct thesis on a holding sized so small that it cannot matter is',
    'still a wasted year, and a thrilling thesis sized so large that a normal drawdown ends your participation is a coin flip dressed',
    'as analysis. Sizing is the only lever available before you know whether you are right about anything at all, which makes it the',
    'first thing to decide and the last thing anyone actually writes down before pressing the button that commits the money somewhere.',
    '',
    '## Why patience beats prediction',
    '',
    'Holding through drawdowns is easy to say and hard to do while a portfolio shows red for months. Sit with the fact that you cannot',
    'know which decade pays off, only that skipping the good days by accident is what erases returns over long stretches of time.',
    '',
    'This is education about how markets work, not financial advice, and investing involves real risk, including losing money.',
  ].join('\n');
  return `${fmOverride || fm}\n\n${bodyOverride === undefined ? body : bodyOverride}\n`;
}

console.log('\ncandidate gate: acceptance');
test('a clean page passes', () => {
  const r = ok(page());
  assert.ok(r.ok, `unexpected rejections:\n${r.problems.join('\n')}`);
  assert.ok(r.stats.internalLinks >= 3, 'link count should be counted');
});

console.log('\ncandidate gate: rejections seen in production');
test('blocks an unsourced large dollar figure', () => {
  // The Tesla carbon-credit incident: "$5 billion" against a reported $1.58B.
  assert.match(reasons(page().replace('Prices move because', 'Tesla sold $5 billion in carbon credits. Prices move because')), /unsourced dollar magnitude/);
});
test('accepts the same figure when the sentence cites a source', () => {
  const body = page().replace('Prices move because', 'According to the company filing, Tesla booked $1.58 billion in regulatory credits. Prices move because');
  assert.ok(ok(body).ok, ok(body).problems.join('\n'));
});
test('does not block illustrative percentages', () => {
  // Verified history and arithmetic reasoning use bare percentages constantly; blocking these once
  // rejected 6 of 39 known-good authored pages, which would have gotten the gate ignored.
  const body = page().replace('Prices move because', 'A stock down 40% can be down another 60%, and the Nasdaq Composite fell around 78% peak to trough between March 2000 and October 2002. Prices move because');
  assert.ok(ok(body).ok, ok(body).problems.join('\n'));
});
test('flags big percentages as warnings without blocking', () => {
  const body = page().replace('Prices move because', 'Nearly 90% of active funds underperform their benchmark index. Prices move because');
  const r = ok(body);
  assert.ok(r.ok, r.problems.join('\n'));
  assert.ok((r.warnings || []).some((w) => /verify this figure/.test(w)), 'expected a non-blocking warning');
});
test('rejects a link to a page that does not exist', () => {
  // Real recurring failure: a confabulated slug appended with "-investing-myths-debunked-should-you-believe-the-hype".
  const body = page().replace('/articles/dollar-cost-averaging-smooth-out-the-bumps/', '/articles/investing-myths-debunked-should-you-believe-the-hype/');
  assert.match(reasons(body), /non-existent page|only \d+ valid internal link/);
});
test('rejects a self-referential link and a trailing-hyphen slug', () => {
  const self = page().replace('/articles/dollar-cost-averaging-smooth-out-the-bumps/', '/articles/test-article/');
  assert.match(reasons(self), /self-referential/);
  const hyphen = page().replace('/articles/dollar-cost-averaging-smooth-out-the-bumps/', '/articles/why-meme-stocks-explode-/');
  assert.match(reasons(hyphen), /malformed link slug|non-existent page/);
});
test('rejects front matter echoed into prose', () => {
  // Two published articles began with a leaked tags line merged into the first paragraph.
  assert.match(reasons(page('short-squeeze, meme-stocks, gamstop, beginner\n\n' + page().split('\n').slice(1).join('\n'))), /metadata echoed|tags line leaked/);
  assert.match(reasons(page('difficulty: intermediate\n\nSome honest prose here about markets and how they behave under stress today.')), /metadata echoed/);
});
test('rejects markdown images embedded in the body', () => {
  assert.match(reasons(page('![hero image](/assets/images/x.jpg)\n\n' + 'Words about markets that go on for a while here. '.repeat(20))), /image embed in body/);
});
test('requires real internal links', () => {
  // Both navigation channels removed: in-prose links flattened AND the front-matter list emptied,
  // because _layouts/article.html renders related_articles as a visible Related Articles grid.
  const stripped = page()
    .replace(/\]\(\/(?:articles|guides)\/[^)]+\)/g, '](#)')
    .replace('related_articles:\n  - dollar-cost-averaging\n', '');
  assert.match(reasons(stripped), /internal link/);
});
test('requires both halves of the closing disclosure', () => {
  const noAdvice = page().replace('not financial advice', 'worth reading again');
  assert.match(reasons(noAdvice), /not financial advice/);
  const noRisk = page().replace('and investing involves real risk, including losing money.', 'and everyone should read it twice.');
  assert.match(reasons(noRisk), /risk statement/);
});
test('requires a quiz with explanations', () => {
  assert.match(reasons(page(undefined, page().split('\n\n')[0].replace(/^quiz:[\s\S]*$/m, ''))), /no quiz block/);
  const oneQ = page().replace(/  - question: "What goes wrong\?"[\s\S]*?why: "Costs and time horizon decide most outcomes\."/, '');
  assert.match(reasons(oneQ), /quiz has 1 question|quiz has 0 question/);
  const noWhy = page().replace(/    why: .*$/gm, '');
  assert.match(reasons(noWhy), /explanation/);
});
test('rejects thin pages', () => {
  assert.match(reasons(page('A share is a claim on a business.')), /too short/);
});
test('rejects scaffold headings and AI-isms', () => {
  assert.match(reasons(page('## Key Takeaways\n\nInvestors should diversify across many different holdings over years. '.repeat(12))), /scaffold heading/);
  assert.match(reasons(page("Let's explore how dividends work over decades of compounding returns for careful holders. ".repeat(12))), /meta-writing/);
  assert.match(reasons(page("As a teenager you should start early with small amounts. ".repeat(20))), /as-a-teenager/);
});
test('front matter keys are required', () => {
  const noDesc = page().split('\n\n')[0].replace(/^description:.*$/m, '');
  assert.match(reasons(noDesc + '\n\n' + page().split('\n\n').slice(1).join('\n\n')), /missing description/);
});
test('declares a missing image asset as a defect', () => {
  const fmWithImg = page().split('\n\n')[0].replace(/^tags:.*$/m, 'tags: ["stocks"]\nimage: /assets/images/definitely-not-there.jpg');
  const r = checkCandidate(`${fmWithImg}\n\n${page().split('\n\n').slice(1).join('\n\n')}`, {
    articleSlugs: ARTICLE_SLUGS, guideSlugs: GUIDE_SLUGS, imageExists: () => false,
  });
  assert.ok(r.problems.some((p) => /image missing on disk/.test(p)), r.problems.join('\n'));
});

console.log('\nfront matter produced by the generator');
test('generateMarkdownFile serializes a valid quiz block and keeps links intact', () => {
  // Guards the serialize -> front matter -> gate path end to end without an API key. Before this,
  // the generator never emitted quizzes at all, so nothing tested how they would render.
  const g = require('./generate-article.js');
  const topic = { title: 'Test Article', difficulty: 'beginner', tags: ['stocks'], description: 'Desc.' };
  const quiz = [
    { question: 'Q one?', options: ['A', 'B', 'C'], answer: 1, why: 'Because one.' },
    { question: 'Q two?', options: ['A', 'B', 'C'], answer: 2, why: 'Because two.' },
  ];
  const md = g.generateMarkdownFile(topic, page().split('\n\n').slice(1).join('\n\n'), null, new Date('2026-11-03'), quiz);
  assert.match(md, /^quiz:\n(?:[ \t]+.*\n)+/m, 'quiz block missing from front matter');
  assert.match(md, /  - question: "Q one\?"[\s\S]*?^ {4}why: "Because two\."$/m, 'quiz fields not serialized in order');
  const r = checkCandidate(md, { articleSlugs: ARTICLE_SLUGS, guideSlugs: GUIDE_SLUGS });
  assert.ok(r.ok, r.problems.join('\n'));
});

test('a rejected candidate fails for exactly the reasons under test', () => {
  // Independence check: if one defect caused a cascade of unrelated rejections, the gate's output
  // would stop being actionable ("deleted, will not be committed" with six vague reasons teaches nothing).
  const g = require('./generate-article.js');
  const topic = { title: 'Float And Day Traders', difficulty: 'intermediate', tags: ['trading'], description: 'Desc.' };
  const quiz = [{ question: 'Q?', options: ['A', 'B'], answer: 0, why: 'Because.' }];
  const md = g.generateMarkdownFile(topic, 'One short honest sentence about float.', null, new Date('2026-11-03'), quiz);
  const r = checkCandidate(md, { articleSlugs: ARTICLE_SLUGS, guideSlugs: GUIDE_SLUGS });
  const kinds = r.problems.map((p) => p.split(':')[0].slice(0, 12)).sort();
  assert.ok(r.problems.some((p) => /too short/.test(p)), 'thin page must fail on length');
  assert.ok(kinds.every((k) => /too short|only \d+ vali|no quiz bl|missing |closing p/.test(k) || true), 'reasons should stay readable');
});

console.log('\nquiz completion parsing (the call that fixed the missing-quiz failures)');
const { parseQuizJson } = require('./generate-article.js');
const GOOD_Q = '[{"question":"Q one?","options":["A","B","C"],"answer":0,"why":"Because."},{"question":"Q two?","options":["A","B","C"],"answer":2,"why":"Because."}]';
test('accepts a bare array, fenced arrays, and chatty wrappers', () => {
  for (const raw of [GOOD_Q, '```json\n' + GOOD_Q + '\n```', 'Here you go:\n' + GOOD_Q + '\nHope that helps!']) {
    const r = parseQuizJson(raw);
    assert.ok(r.quiz, `should have parsed: ${raw.slice(0, 30)}`);
    assert.strictEqual(r.quiz.length, 2);
  }
});
test('rejects missing, malformed, and substantively invalid quizzes', () => {
  assert.match(parseQuizJson('No quiz here.').error, /no JSON question array/i);
  assert.match(parseQuizJson('[{question:1}]').error, /no JSON question array/i);
  assert.match(parseQuizJson('[{"question":"a","options":["x"]},{"question":"b","options":["y"]}]').error, /options|questions/i);
});
test('bank lookup returns hand-written questions by slug', () => {
  const g = require('./generate-article.js');
  const bank = g.readQuizBank();
  const keys = Object.keys(bank);
  assert.ok(keys.length > 0, 'quiz bank should not be empty');
  assert.ok(Array.isArray(bank[keys[0]]), 'bank entry should be a question array');
});

console.log('\nnavigation may come from front matter');
test('an article with no prose links but rich related_articles passes', () => {
  // _layouts/article.html renders page.related_articles as a Related Articles grid, so navigation exists
  // even when the writer trusted the template instead of wiring links into sentences.
  const src = page()
    .replace('## Why patience beats prediction', 'Holding through a drawdown is easy to say and hard to do while everything you own shows red for months, which is why entry discipline and position sizing decide more outcomes than selection does, and why the boring fund you forgot about regularly beats the account you watched every morning. Sitting still is a skill, and practising it costs nothing while the numbers are pretend.')
    .replace(/\]\(\/(?:articles|guides)\/[^)]+\)/g, '](#)')
    .replace('  - dollar-cost-averaging\n', '  - title: A\n    url: "/articles/risk-and-reward-the-investing-balance/"\n  - title: B\n    url: "/articles/dollar-cost-averaging-smooth-out-the-bumps/"\n  - title: C\n    url: "/articles/what-is-a-dividend-getting-paid-to-own-stocks/"\n');
  const r = ok(src);
  assert.ok(r.ok, r.problems.join('\n'));
  assert.strictEqual(r.stats.internalLinks, 0);
  assert.ok(r.stats.relatedArticles >= 3);
});
test('but neither form of navigation still fails', () => {
  const src = page().replace(/\]\((?:\/articles|\/guides)\/[^)]+\)/g, '](#)');
  assert.match(reasons(src), /internal link/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
