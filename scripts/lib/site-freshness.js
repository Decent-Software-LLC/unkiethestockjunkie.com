'use strict';
/**
 * Is `_site` actually built from the content that is on disk right now?
 *
 * Several suites (financial claims, built-output link integrity, quiz rendering) verify things that only exist
 * after Jekyll runs. Their original guard was `if (!fs.existsSync(SITE)) { print "skipped"; exit 0 }`, which
 * handles "never built" but not the far worse case: a build from days ago still sitting there. Those suites then
 * graded yesterday's HTML, reported every assertion green, and authorised publishing for work they had never
 * looked at. A stale build is not an absence of information -- it is confidently wrong information. Mine had
 * drifted far enough that brand-new quizzes were missing from the very pages being graded as correct.
 *
 * Staleness is judged by hashing the inputs against a manifest recorded at build time
 * (scripts/mark-site-built.js). Timestamps were tried first and rejected: the test suite legitimately
 * round-trips a real article through scripts/rewrite-body.js and restores it byte-for-byte, bumping its mtime
 * past the build without changing any content, so an mtime rule would report "stale" on every single run.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
// Kept OUTSIDE _site on purpose. Jekyll runs as root inside the build container, so anything the pipeline needs to
// write afterwards has to live somewhere the runner user can actually touch -- writing into _site failed CI with
// EACCES on the very next step. Both locations are still read so an existing manifest is not orphaned.
const MANIFEST_REL = '.site-build-manifest.json';
const MANIFEST_CANDIDATES = [MANIFEST_REL, path.join('_site', '.build-manifest.json')];

/** First readable manifest path (relative to root), or null. */
function manifestPath(root) {
  for (const rel of MANIFEST_CANDIDATES) {
    try { fs.accessSync(path.join(root, rel), fs.constants.R_OK); return rel; } catch (e) { /* try next */ }
  }
  return null;
}

// Directories whose contents appear in rendered output. Deliberately excludes scripts/, tests and node_modules:
// they cannot affect HTML, and counting them would fail the check for changes that are irrelevant to it.
const INPUT_DIRS = ['_articles', '_guides', '_includes', '_layouts', '_data', 'assets'];
const INPUT_FILES = ['_config.yml'];
const IGNORE = new Set(['.DS_Store', '.git', 'node_modules', '.jekyll-cache']);

/** Relative paths of every file whose contents can change the rendered site. */
function inputFiles(root) {
  const out = [];
  const walk = (abs, relBase) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      return; // absent optional directory contributes nothing
    }
    for (const ent of entries) {
      if (IGNORE.has(ent.name)) continue;
      const absChild = path.join(abs, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(absChild, rel);
      else if (ent.isFile()) out.push(rel);
    }
  };
  for (const d of INPUT_DIRS) walk(path.join(root, d), d);
  for (const f of INPUT_FILES) {
    try { if (fs.statSync(path.join(root, f)).isFile()) out.push(f); } catch (e) { /* optional */ }
  }
  return out.sort();
}

function hashOf(root, rel) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  } catch (e) {
    return null; // unreadable or deleted since listing
  }
}

/**
 * @param {{root?: string}} [opts] root defaults to the repository; overridable so the rule itself can be tested.
 * @returns {{status: 'fresh'|'stale'|'missing'|'unmarked', site: string, detail: string, examples?: string[]}}
 */
function checkSite(opts = {}) {
  const root = opts.root || ROOT;
  const site = path.join(root, '_site');
  if (!fs.existsSync(site)) return { status: 'missing', site, detail: 'no _site build found' };

  const manRel = manifestPath(root);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, manRel), 'utf8'));
  } catch (e) {
    return {
      status: 'unmarked',
      site,
      detail: `_site has no ${MANIFEST_REL}, so nothing proves it matches the content on disk`,
    };
  }
  const built = manifest.files || {};
  const current = inputFiles(root);
  const changes = [];
  for (const rel of current) {
    if (built[rel] !== hashOf(root, rel)) changes.push(built[rel] ? `changed ${rel}` : `new ${rel}`);
  }
  for (const rel of Object.keys(built)) {
    if (!current.includes(rel)) changes.push(`deleted ${rel}`);
  }
  if (changes.length) {
    return {
      status: 'stale',
      site,
      detail: `${changes.length} content file(s) differ from what _site was built from`,
      examples: changes.slice(0, 5),
    };
  }
  return { status: 'fresh', site, detail: 'build covers current content' };
}

/**
 * Guard used by every build-dependent suite. Exits non-zero when rendered output cannot be trusted, because
 * silently skipping these checks is what allowed content to be approved against output nobody regenerated.
 * Override deliberately with SITE_CHECKS=0.
 */
function requireFreshSite(suiteName) {
  if (process.env.SITE_CHECKS === '0') {
    console.log(`\n${suiteName}\n\n  - site freshness check disabled by SITE_CHECKS=0\n`);
    return;
  }
  const res = checkSite();
  if (res.status === 'fresh') return;
  const remedy = res.status === 'missing'
    ? 'npm run build'
    : res.status === 'unmarked'
      ? 'npm run build   (which also records the build manifest)'
      : 'npm run build   (the existing _site predates your content)';
  console.error(`\n${suiteName}: refusing to grade a build we cannot trust`);
  console.error(`  ${res.detail}`);
  if (res.examples) for (const ex of res.examples) console.error(`    · ${ex}`);
  console.error(`  These suites read rendered HTML. Grading an absent or outdated _site reports success without`);
  console.error(`  having looked at the current content, which is exactly how content gets published unverified.`);
  console.error(`  Fix: ${remedy}`);
  console.error(`  Intentional override: SITE_CHECKS=0 npm test\n`);
  process.exit(1);
}

module.exports = { checkSite, requireFreshSite, inputFiles, manifestPath, MANIFEST_REL, MANIFEST_CANDIDATES, INPUT_DIRS, INPUT_FILES };
