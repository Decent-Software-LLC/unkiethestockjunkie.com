#!/usr/bin/env node
/**
 * Single source of truth for "what does this site actually have".
 *
 * Three consumers previously measured the same thing independently: scripts/progress-report.js (tables),
 * scripts/verify-content.js (link resolution) and scripts/generate-article.js (whether a draft was usable).
 * Divergent metrics caused two real bugs the same day -- a quiz minimum enforced in one place and not the
 * other, and a word count checked behind a condition that had become unreachable -- both invisible because
 * each file looked correct on its own. Anything asking "is this page finished / how long is it / does it
 * still contain AI-isms" should call here.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { filenameToSlug } = require('./slug');

// Banned-voice tells, counted (not asserted) so the corpus can be tracked down over time.
const TELL_RE = /young investor|lemonade stand|Imagine you're at a|In this article|\bessential\b|\bcrucial\b|\bparamount\b|dive in|game changer|delve|embark|unlock(?:ing)? the|in today'?s fast-paced|let'?s explore/gi;

const TIERS = ['beginner', 'intermediate', 'advanced'];

function readFrontMatter(src) {
  return src.split(/^---[ \t]*$/m)[1] || '';
}
function readBody(src) {
  const parts = src.split(/^---[ \t]*$/m);
  return parts.length >= 3 ? parts.slice(2).join('---') : '';
}
function normBody(src) {
  return readBody(src).replace(/\s+/g, ' ').trim();
}
function proseWords(body) {
  return body.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*\|.*\|$/gm, ' ')
    .split(/\s+/).filter((w) => /[A-Za-z]{5,}/.test(w)).length;
}
function slugFromFile(file) {
  return filenameToSlug(file);
}
function titleFrom(fm) {
  return (((fm.match(/^title:[ \t]*(.*)/m) || [, '?'])[1] || '?').replace(/^["']|["']$/g, '')).trim();
}

/** Authorship is recorded explicitly by scripts/rewrite-body.js; never inferred from git history. */
function loadAuthoredManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'content-rewrites.json'), 'utf8')).slugs || {};
  } catch (e) {
    return {};
  }
}

function baselineCommit(root) {
  try {
    return execSync('git rev-list --max-parents=0 HEAD', { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
  } catch (e) {
    return null;
  }
}

/**
 * @param {{root?:string, withBaseline?:boolean}} opts withBaseline shells out to git once per article to
 *   distinguish untouched-from-import vs cron-added; skip it when only counts/tiers matter.
 */
function loadInventory(opts) {
  const root = (opts && opts.root) || path.join(__dirname, '..', '..');
  const withBaseline = !!(opts && opts.withBaseline);
  const articlesDir = path.join(root, '_articles');
  const guidesDir = path.join(root, '_guides');
  const authored = loadAuthoredManifest(root);
  const base = withBaseline ? baselineCommit(root) : null;

  const committedAt = (rel) => {
    if (!base) return null;
    try {
      return execSync(`git show ${base}:${rel}`, {
        cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) {
      return null;
    }
  };

  const files = fs.existsSync(articlesDir) ? fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md')) : [];
  const rows = files.map((f) => {
    const rel = `_articles/${f}`;
    const src = fs.readFileSync(path.join(articlesDir, f), 'utf8');
    const fm = readFrontMatter(src);
    const body = readBody(src);
    const slug = slugFromFile(f);
    const status = authored[slug] ? 'authored'
      : (withBaseline ? (committedAt(rel) === null ? 'generated' : (normBody(committedAt(rel)) !== normBody(src) ? 'touched' : 'untouched')) : 'unknown');
    return {
      file: rel,
      slug,
      title: titleFrom(fm),
      tier: (((fm.match(/difficulty:[ \t]*(\w+)/) || [, ''])[1] || 'unset')).toLowerCase(),
      quiz: /^quiz:[ \t]*$/m.test(fm),
      questions: (fm.match(/^[ \t]+- question:/gm) || []).length,
      related: /^[ \t]+url:[ \t]*\/articles\//.test(fm) || /related_articles:/.test(fm),
      words: proseWords(body),
      status,
      rewritten: status === 'authored',
      tells: (body.match(TELL_RE) || []).length,
    };
  });

  const guides = fs.existsSync(guidesDir) ? fs.readdirSync(guidesDir).filter((f) => f.endsWith('.md')) : [];
  // Same definition progress-report prints: an authored body recorded in the manifest AND a quiz.
  const isDone = (r) => r.quiz && r.status === 'authored';
  const byTier = () => TIERS.reduce((acc, t) => {
    const g = rows.filter((r) => r.tier === t);
    acc[t] = { total: g.length, done: g.filter(isDone).length, remaining: g.filter((r) => !isDone(r)).length };
    return acc;
  }, {});

  return { rows, guides, isDone, byTier, slugSet: new Set(rows.map((r) => r.slug)) };
}

module.exports = {
  loadInventory,
  loadAuthoredManifest,
  slugFromFile,
  proseWords,
  readFrontMatter,
  readBody,
  normBody,
  TELL_RE,
  TIERS,
};
