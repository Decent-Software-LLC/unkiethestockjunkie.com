#!/usr/bin/env node
/**
 * Gap-driven topic selection for the daily generator.
 *
 * Topics used to be drawn uniformly at random from topics.json. With 62 unfinished pages on a site whose
 * readers are 16- and 17-year-olds with a part-time job, that repeatedly spent the single daily slot on
 * advanced theory -- "How to Construct a Market-Neutral Strategy", "The Black-Litterman Model" -- which the
 * small model also wrote worst (sub-400-word drafts that died at the gate). Selection is what made those
 * runs wasteful, so selection reads the real backlog instead of rolling dice.
 *
 * Pure functions over plain data so the ranking can be unit-tested without a filesystem or an API key.
 */

'use strict';

// While this many non-advanced pages are unfinished, advanced topics are near-deprioritised: they serve
// the smallest audience today and are the least likely to clear the publication gate in one attempt.
const ADVANCED_BACKLOG_THRESHOLD = 10;
const ADVANCED_PENALTY = 0.15;
// A topic rejected this many times is parked rather than retried forever. Repeated failure on the same
// brief usually means the brief itself is wrong for this model, not that we need another roll.
const MAX_FAILURES = 3;

function slugifyTitle(title) {
  return String(title || '').toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Deterministic per-day tiebreak: stable ordering within a run (reproducible logs) but different tomorrow,
// so low-priority topics are not permanently starved by alphabetical luck.
function dayHash(dayKey, title) {
  const s = `${dayKey}|${title}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * @param {object} input
 * @param {Array<{title:string,difficulty?:string,tags?:string[]}>} input.topics
 * @param {Set<string>} input.existingSlugs published slugs, to stop duplicate pages
 * @param {Record<string,{total:number,done:number,remaining:number}>} input.tierStats from content-inventory.byTier()
 * @param {Record<string,{fails?:number,lastReason?:string}>} [input.failures] prior rejections by title
 * @param {string} input.dayKey YYYY-MM-DD seed for rotation
 * @returns {{candidates:Array<{topic:object,score:number,reasons:string[]}>,skipped:Array<{title:string,reason:string}>,summary:object}}
 */
function rankTopics(input) {
  const topics = input.topics || [];
  const existing = input.existingSlugs || new Set();
  const stats = input.tierStats || {};
  const failures = input.failures || {};
  const dayKey = input.dayKey || new Date().toISOString().slice(0, 10);

  const remainingFor = (tier) => (stats[tier] ? stats[tier].remaining : 0);
  const maxRemaining = Math.max(1, ...Object.keys(stats).length
    ? Object.values(stats).map((v) => v.remaining) : [1]);
  const nonAdvancedRemaining = remainingFor('beginner') + remainingFor('intermediate');

  const skipped = [];
  const scored = [];

  for (const topic of topics) {
    const slug = slugifyTitle(topic.title);
    if (!slug) { skipped.push({ title: topic.title, reason: 'empty title' }); continue; }
    if (existing.has(slug)) { skipped.push({ title: topic.title, reason: `page already exists at /articles/${slug}/` }); continue; }
    const prior = failures[topic.title];
    if (prior && (prior.fails || 0) >= MAX_FAILURES) {
      skipped.push({ title: topic.title, reason: `parked after ${prior.fails} rejected attempts (${prior.lastReason || 'reason unrecorded'})` });
      continue;
    }

    const tier = String(topic.difficulty || '').toLowerCase();
    const reasons = [];
    let score = 1;

    // Weight by how much of that tier is still unfinished, so the largest backlog gets most slots.
    const share = remainingFor(tier) / maxRemaining;
    score += share * 2;
    reasons.push(`${tier || 'unknown'} backlog ${remainingFor(tier)} (weight share ${share.toFixed(2)})`);

    if (tier === 'advanced' && nonAdvancedRemaining >= ADVANCED_BACKLOG_THRESHOLD) {
      score *= ADVANCED_PENALTY;
      reasons.push(`advanced held back while ${nonAdvancedRemaining} beginner/intermediate pages remain`);
    }
    if (prior && prior.fails > 0) {
      score *= 0.5;
      reasons.push(`already failed ${prior.fails}x, deprioritised`);
    }

    // Small deterministic jitter keeps ties rotating day to day without making runs unreproducible.
    const jitter = dayHash(dayKey, topic.title) * 0.35;
    score += jitter;
    reasons.push(`daily rotation ${jitter.toFixed(2)}`);

    scored.push({ topic, score, reasons });
  }

  scored.sort((a, b) => (b.score - a.score) || String(a.topic.title).localeCompare(String(b.topic.title)));

  return {
    candidates: scored,
    skipped,
    summary: {
      dayKey,
      considered: topics.length,
      eligible: scored.length,
      nonAdvancedRemaining,
      tiers: stats,
    },
  };
}

module.exports = {
  rankTopics,
  slugifyTitle,
  ADVANCED_BACKLOG_THRESHOLD,
  ADVANCED_PENALTY,
  MAX_FAILURES,
};
