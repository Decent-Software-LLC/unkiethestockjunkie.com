#!/usr/bin/env node
/**
 * One definition of "a page that links can point at".
 *
 * Four scripts each derived this independently and only one of them got it right by accident:
 * verify-content.js built `{articles, guides}` sets from `_readdir`, check-candidate.js had a second
 * copy of the same strip-the-date-prefix regex, generate-article.js had a third inside linkPoolFor,
 * and content-inventory.js held a fourth as slugFromFile while exposing guides as bare filenames so a
 * consumer reading `guide.slug` would have silently seen undefined. Parallel implementations are how
 * "link resolves" started meaning different things in generation than at the gate: the generator could
 * offer a target the reviewer then rejected, or the self-link test compared a filename slug produced by
 * one function against a title slug produced by another and quietly never matched.
 *
 * This module owns: which collections exist, whether a collection/slug pair is linkable, closest-existing-slug
 * suggestions, and which topics are still backlog. Filename and title slug rules live in the dependency-free
 * scripts/lib/slug.js so the gate can use them without acquiring a filesystem dependency.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { titleSlug, filenameToSlug } = require('./slug');

const ROOT = path.join(__dirname, '..', '..');
const COLLECTIONS = { articles: '_articles', guides: '_guides' };

const isMarkdown = (f) => f.endsWith('.md') && !f.startsWith('.') && !/^readme$/i.test(f.replace(/\.md$/, ''));

/** Slugs published in one collection, derived from source files -- not from _site. */
function collectionSlugs(collection, root = ROOT) {
  const dir = path.join(root, COLLECTIONS[collection]);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).filter(isMarkdown).map(filenameToSlug));
}

/** `{articles:Set, guides:Set}` built once per process by whoever needs it. */
function publishedPages(root = ROOT) {
  return Object.keys(COLLECTIONS).reduce((acc, c) => {
    acc[c] = collectionSlugs(c, root);
    return acc;
  }, {});
}

/**
 * Does `/articles/<slug>/` resolve? Collections stay separate on purpose: Jekyll serves them from
 * different directories, so a guide slug used as an article link 404s in production while a merged set
 * would wave it through. `exclude` removes the candidate's own slug so a draft linking at itself reads
 * as the artifact it is instead of resolving against its own filename.
 */
function isLinkable(pages, collection, slug, exclude) {
  const set = pages[collection];
  if (!set) throw new Error(`unknown collection: ${collection}`);
  if (typeof slug !== 'string' || !slug) return false;
  if (exclude && slug === exclude) return false;
  return set.has(slug);
}

/** Shared bigram similarity so every caller suggests rather than shrugging. */
function nearestSlug(target, pool, minScore = 0.62) {
  if (!target || !pool || !pool.size) return null;
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const a = grams(String(target));
  if (!a.size) return null;
  let best = null, bestScore = minScore;
  for (const cand of pool) {
    const b = grams(cand);
    if (!b.size) continue;
    let shared = 0;
    for (const g of a) if (b.has(g)) shared++;
    const score = (2 * shared) / (a.size + b.size);
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  return best;
}

/**
 * Topics queued for the daily generator whose pages do not exist yet. These are legitimate research
 * backlog and illegitimate link targets -- a model given a backlog title may well write
 * `/articles/<that-slug>/`, and the result looks authoritative while 404ing forever. Keeping the two
 * populations explicitly disjoint is what lets a test tell "not written yet" apart from "never existed".
 */
function backlogSlugs({ topics, pages, titleToSlug = slugFromTitle }) {
  const list = Array.isArray(topics) ? topics : (topics && Array.isArray(topics.topics) ? topics.topics : []);
  const published = pages || publishedPages();
  const out = [];
  for (const t of list) {
    const title = t && t.title;
    if (!title) continue;
    const slug = titleToSlug(title);
    if (!slug) continue;
    if (!published.articles.has(slug) && !published.guides.has(slug)) out.push({ title, slug });
  }
  return out;
}

/** Title -> slug. Rule lives in lib/slug.js (see there for why canonical = the generator's original). */
function slugFromTitle(title) {
  return titleSlug(title);
}

/** Internal link targets actually present in a markdown document (prose plus front matter URLs). */
function linkTargetsIn(src) {
  const text = String(src);
  const found = [];
  for (const m of text.matchAll(/\]\(\/(articles|guides)\/([a-z0-9][a-z0-9-]*)\/?\)/g)) {
    found.push({ collection: m[1], slug: m[2], where: 'prose', raw: m[0] });
  }
  for (const m of text.matchAll(/url:\s*["']?\/(articles|guides)\/([a-z0-9][a-z0-9-]*)\//g)) {
    found.push({ collection: m[1], slug: m[2], where: 'front-matter', raw: m[0] });
  }
  return found;
}

/**
 * Every unresolved internal link across source files. Runs over sources rather than _site so drafts and
 * unpublished candidates surface before publication -- scripts/test-links.js covers built HTML, which is a
 * different question (does what shipped resolve) and catches template-level breakage this cannot see.
 */
function unresolvedLinks(pages = publishedPages(), root = ROOT) {
  const bad = [];
  for (const [collection, dirName] of Object.entries(COLLECTIONS)) {
    const dir = path.join(root, dirName);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(isMarkdown)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const own = filenameToSlug(f);
      for (const t of linkTargetsIn(src)) {
        if (t.collection === collection && t.slug === own) continue; // self-link reported by the gate/verify
        if (!isLinkable(pages, t.collection, t.slug)) {
          const hint = nearestSlug(t.slug, pages[t.collection]);
          bad.push({ file: `${COLLECTIONS[collection]}/${f}`, ...t, hint });
        }
      }
    }
  }
  return bad;
}

module.exports = {
  ROOT,
  COLLECTIONS,
  collectionSlugs,
  publishedPages,
  isLinkable,
  nearestSlug,
  backlogSlugs,
  titleSlug: slugFromTitle,
  linkTargetsIn,
  unresolvedLinks,
};
