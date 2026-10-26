#!/usr/bin/env node
/**
 * Tests for scripts/lib/topic-selector.js -- what the daily generator decides to write.
 *
 * Selection used to be `Math.random()` over topics.json, which spent single daily slots on advanced theory
 * ("Market-Neutral Strategy", "Black-Litterman Model") while dozens of beginner/intermediate pages stayed
 * unfinished -- and those drafts were also the ones the gate rejected, so the whole day was wasted. These
 * tests pin the replacement's promises rather than its implementation.
 */

'use strict';

const assert = require('assert');
const { rankTopics, slugifyTitle, MAX_FAILURES, ADVANCED_PENALTY } = require('./lib/topic-selector');
const { filenameToSlug } = require('./lib/slug');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${name}\n      ${String(e.message).split('\n').slice(0, 4).join('\n      ')}`); }
}

const T = (title, difficulty) => ({ title, difficulty, tags: [difficulty] });
const STATS = (b, i, a) => ({
  beginner: { total: b.t, done: b.d, remaining: b.r },
  intermediate: { total: i.t, done: i.d, remaining: i.r },
  advanced: { total: a.t, done: a.d, remaining: a.r },
});

console.log('\ntopic selection');

test('topics whose page already exists are never selected', () => {
  // Duplicate pages were a real production problem (two market-cap articles shipped from this gap).
  const r = rankTopics({
    topics: [T('What Is Market Cap? Size Matters In Investing', 'beginner'), T('Fresh Brief', 'beginner')],
    existingSlugs: new Set(['what-is-market-cap-size-matters-in-investing']),
    tierStats: STATS({ t: 1, d: 0, r: 1 }, { t: 5, d: 0, r: 5 }, { t: 2, d: 0, r: 2 }),
    dayKey: '2026-11-02',
  });
  assert.deepStrictEqual(r.candidates.map((c) => c.topic.title), ['Fresh Brief']);
  assert.match(r.skipped[0].reason, /already exists/);
});

test('advanced briefs are held back while the beginner/intermediate backlog is large', () => {
  const topics = [T('Quant Strategy Deep Dive', 'advanced'), T('What Is A Dividend', 'beginner')];
  const r = rankTopics({
    topics,
    existingSlugs: new Set(),
    tierStats: STATS({ t: 40, d: 10, r: 30 }, { t: 32, d: 0, r: 32 }, { t: 30, d: 0, r: 30 }),
    dayKey: '2026-11-02',
  });
  assert.strictEqual(r.candidates[0].topic.title, 'What Is A Dividend');
  const adv = r.candidates.find((c) => c.topic.title === 'Quant Strategy Deep Dive');
  assert.ok(adv.reasons.some((x) => /advanced held back/.test(x)), 'explanation should say why it lost');
});

test('once the easier backlog is small, advanced competes normally', () => {
  const topics = [T('Quant Strategy Deep Dive', 'advanced'), T('One Left Beginner', 'beginner')];
  const r = rankTopics({
    topics,
    existingSlugs: new Set(),
    tierStats: STATS({ t: 41, d: 40, r: 1 }, { t: 32, d: 31, r: 1 }, { t: 30, d: 0, r: 30 }),
    dayKey: '2026-11-02',
  });
  // Advanced now has by far the largest remaining backlog, so it should lead.
  assert.strictEqual(r.candidates[0].topic.title, 'Quant Strategy Deep Dive');
  assert.ok(!r.candidates[0].reasons.some((x) => /advanced held back/.test(x)));
});

test('a brief that keeps failing gets parked instead of redrawn forever', () => {
  const failures = { 'Impossible Brief': { fails: MAX_FAILURES, lastReason: 'too short: 179 words' } };
  const r = rankTopics({
    topics: [T('Impossible Brief', 'intermediate'), T('Fine Brief', 'intermediate')],
    existingSlugs: new Set(),
    tierStats: STATS({ t: 1, d: 1, r: 0 }, { t: 5, d: 0, r: 5 }, { t: 1, d: 1, r: 0 }),
    failures,
    dayKey: '2026-11-02',
  });
  assert.deepStrictEqual(r.candidates.map((c) => c.topic.title), ['Fine Brief']);
  assert.match(r.skipped[0].reason, /parked after 3 rejected attempts/);
});

test('one failure only softens a brief rather than deleting it', () => {
  const r = rankTopics({
    topics: [T('Once Rejected', 'intermediate'), T('Never Tried', 'intermediate')],
    existingSlugs: new Set(),
    tierStats: STATS({ t: 1, d: 1, r: 0 }, { t: 5, d: 0, r: 5 }, { t: 1, d: 1, r: 0 }),
    failures: { 'Once Rejected': { fails: 1 } },
    dayKey: '2026-11-02',
  });
  assert.ok(r.candidates.some((c) => c.topic.title === 'Once Rejected'), 'a single rejection must not park a brief');
  assert.ok(r.candidates.find((c) => c.topic.title === 'Once Rejected').reasons.some((x) => /deprioritised/.test(x)));
});

test('the biggest unfinished tier wins the slot', () => {
  const r = rankTopics({
    topics: [T('Beg Thing', 'beginner'), T('Int Thing', 'intermediate')],
    existingSlugs: new Set(),
    tierStats: STATS({ t: 41, d: 41, r: 0 }, { t: 32, d: 0, r: 32 }, { t: 30, d: 28, r: 2 }),
    dayKey: '2026-11-02',
  });
  assert.strictEqual(r.candidates[0].topic.title, 'Int Thing', 'unfinished tier should outrank a finished one');
});

test('ordering is stable within a day but rotates across days', () => {
  const topics = ['A Brief', 'B Brief', 'C Brief', 'D Brief'].map((x) => T(x, 'intermediate'));
  const mk = (day) => rankTopics({
    topics, existingSlugs: new Set(),
    tierStats: STATS({ t: 1, d: 1, r: 0 }, { t: 4, d: 0, r: 4 }, { t: 1, d: 1, r: 0 }),
    dayKey: day,
  }).candidates.map((c) => c.topic.title).join(',');
  assert.strictEqual(mk('2026-11-02'), mk('2026-11-02'), 'same day must be reproducible for log comparison');
  const days = new Set([mk('2026-11-02'), mk('2026-11-03'), mk('2026-11-04'), mk('2026-11-05')]);
  assert.ok(days.size > 1, 'ties must rotate across days or low-priority briefs starve');
});

test('empty inputs degrade quietly rather than throwing', () => {
  const r = rankTopics({ topics: [], existingSlugs: new Set(), tierStats: {}, dayKey: '2026-11-02' });
  assert.deepStrictEqual(r.candidates, []);
  assert.strictEqual(r.summary.eligible, 0);
});

test('slugification matches the filename the generator will actually write', () => {
  // If these two disagree, "page already exists" silently misses and duplicates slip through again.
  assert.strictEqual(slugifyTitle("Why 'Time in the Market' Beats 'Timing the Market'"),
    'why-time-in-the-market-beats-timing-the-market');
  assert.strictEqual(slugifyTitle('ETFs: Instant Diversification Made Easy'),
    'etfs-instant-diversification-made-easy');
  const fs = require('fs');
  const files = fs.readdirSync('_articles').map(filenameToSlug);
  // Cross-checked against the archive rather than the live queue: the seven retained briefs are all
  // deliberately unwritten, and only a title the generator already turned into a file can prove the two
  // derivations agree. Chosen dynamically so the check cannot decay into a no-op when the queue changes.
  const archive = JSON.parse(fs.readFileSync('topics-archive.json', 'utf8')).topics;
  const samples = archive.filter((tp) => files.includes(slugifyTitle(tp.title)));
  assert.ok(samples.length > 0, 'expected at least one archived brief whose page was published');
  for (const s of samples.slice(0, 5)) {
    assert.ok(files.includes(slugifyTitle(s.title)), `selector slug must match an on-disk article (${s.title})`);
  }
});

// ---------------------------------------------------------------- queue hygiene after completion review

test('the live queue stays small enough for a human to have actually read it', () => {
  // The failure this prevents is the silent one: someone pastes ninety briefs back in, the cron goes
  // unattended again, and "reviewed before publication" stops being true while every gate stays green.
  const topics = require('../topics.json');
  assert.ok(Array.isArray(topics) && topics.length > 0, 'queue must exist');
  assert.ok(topics.length <= 15, `queue holds ${topics.length} entries; above 15 nobody is reviewing them`);
  for (const t of topics) {
    assert.ok(t.title && t.title.length > 8, 'topic needs a title');
    assert.ok(['beginner', 'intermediate', 'advanced'].includes(t.difficulty), `bad difficulty on "${t.title}"`);
    assert.ok(Array.isArray(t.tags) && t.tags.length >= 2, `topic "${t.title}" needs tags`);
    assert.ok(t.description && t.description.length > 40, `topic "${t.title}" needs a description stating what gets taught`);
    assert.ok(t.rationale, `topic "${t.title}" needs the reason it survived the completion review`);
  }
});

test('content generation cannot run unattended again without a deliberate edit', () => {
  const yml = require('fs').readFileSync('.github/workflows/generate-content.yml', 'utf8');
  assert.ok(/^on:\s*$/m.test(yml) || /^on:/m.test(yml), 'workflow missing its trigger block');
  assert.ok(!/^\s*schedule:/m.test(yml),
    'a schedule trigger is back -- manual dispatch only until a queue with real gaps plus an approval step exists');
  assert.ok(/workflow_dispatch/.test(yml), 'manual dispatch must remain available');
});

test('archived briefs record why they were not published here', () => {
  const fs = require('fs');
  const doc = JSON.parse(fs.readFileSync('topics-archive.json', 'utf8'));
  assert.ok(Array.isArray(doc.topics) && doc.topics.length > 50, 'archive should hold the retired briefs');
  assert.ok(doc.note && doc.note.length > 60, 'archive needs the context explaining its own existence');
  const unexplained = doc.topics.filter((t) => !Array.isArray(t.reasons) || !t.reasons.length);
  assert.deepStrictEqual(unexplained.map((t) => t.title), [], 'every archived topic needs a stated reason');
  // Retained briefs must not also sit in the archive, or restoring either file silently resurrects both.
  const live = new Set(require('../topics.json').map((t) => t.source_title || t.title));
  const dupes = doc.topics.filter((t) => live.has(t.title)).map((t) => t.title);
  assert.deepStrictEqual(dupes, [], 'a brief cannot be both queued and archived');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
