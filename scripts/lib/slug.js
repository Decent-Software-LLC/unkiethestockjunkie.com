#!/usr/bin/env node
/**
 * The two slug rules this site depends on, in exactly one place, with no dependencies.
 *
 * Purity matters here beyond tidiness: scripts/lib/candidate-gate.js documents that nothing in it touches
 * the filesystem, so a wrong `ls` can never silently weaken a check. That invariant only holds if shared
 * helpers like these stay dependency-free -- importing a slug rule from a module that reads directories or
 * shells out to git would break it while looking like an innocent refactor.
 *
 * Three copies of the title rule previously existed: the generator's (which named every file on disk), the
 * gate's, and the topic selector's. The latter two dropped apostrophes and punctuation differently from the
 * first, so "The 50/30/20 Rule" published as `the-50-30-20-rule-...` while selection computed
 * `the-503020-rule-...`, concluded no such page existed, and kept re-queueing an article already live.
 * Canonical semantics are therefore the generator's original ones, because they describe reality on disk.
 */

'use strict';

/** Title -> URL/filename slug. Non-alphanumeric runs collapse to a single hyphen. */
function titleSlug(title) {
  return String(title == null ? '' : title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `_articles/2026-03-12-some-title.md` -> `some-title`. Accepts bare filenames or paths. */
function filenameToSlug(file) {
  const base = String(file == null ? '' : file).split(/[\\/]/).pop();
  return base.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '');
}

module.exports = { titleSlug, filenameToSlug };
