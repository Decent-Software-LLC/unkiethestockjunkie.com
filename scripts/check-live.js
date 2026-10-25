#!/usr/bin/env node
// Is what we committed actually what GitHub Pages is serving?
//
// Green CI only proves the site built. This compares the first substantial sentence of each
// article against the deployed page, so "it's live" is a measured claim rather than an inference.
//
//   node scripts/check-live.js                 # check everything changed in the last 8 commits
//   node scripts/check-live.js --all           # check every article (slow)
//   node scripts/check-live.js <file> [...]    # check specific _articles/ paths
//   node scripts/check-live.js --self-test     # prove the comparator detects tampering
//
// Failure modes learned building this: source Markdown is NOT served verbatim. kramdown converts
// straight quotes to curly ones, "&" becomes &amp;, and tags are stripped. Comparisons must undo
// all three or healthy pages report as stale. Empty probes must fail loudly rather than match.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.SITE_URL || 'https://unkiethestockjunkie.com';
const argv = process.argv.slice(2);

// Undo exactly the transformations Jekyll/kramdown applies to prose.
function normalize(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    // Kramdown turns a source "--" into one en dash and "---" into one em dash, so the source side still holds two
    // or three hyphens where the served page has one. Without collapsing runs, any sentence written with markdown
    // dashes reports "content committed but not serving" -- a false negative that reads exactly like a failed deploy.
    .replace(/-{2,}/g, '-')
    // Removing inline markup (<em>, <strong>) can strand a space before punctuation:
    // "it <em>safe</em>, though" -> "it safe , though" which never matches the source.
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// First prose sentence long enough to be a meaningful probe. Headings and quiz lines excluded.
function probeOf(bodyText) {
  const prose = bodyText
    .replace(/^---[ \t]*$/gm, '')
    .replace(/^#+.*$/gm, ' ')
    .replace(/^\s*[-*]\s+.*$/gm, ' ')
    .replace(/\|.*\|/g, ' ');
  const m = prose.replace(/[*_`]/g, '').match(/[A-Z][^.!?]{48,200}[.!?]/);
  return m ? normalize(m[0]).slice(0, 60) : null;
}

function bodyOf(src) {
  const parts = src.split(/^---[ \t]*$/m);
  return parts.length >= 3 ? parts.slice(2).join('---') : '';
}

function targets() {
  let files;
  const explicit = argv.filter((a) => !a.startsWith('--'));
  if (explicit.length) {
    files = explicit.map((f) => f.replace(/^\.?\//, ''));
  } else if (argv.includes('--all')) {
    files = fs.readdirSync(path.join(ROOT, '_articles')).map((f) => `_articles/${f}`);
  } else {
    files = [...new Set(execSync('git log --name-only --pretty=format: -8', { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter((f) => /^_(articles|guides)\//.test(f) && f.endsWith('.md')))];
  }
  return files.filter((f) => fs.existsSync(path.join(ROOT, f)));
}

async function checkOne(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const probe = probeOf(bodyOf(src));
  if (!probe) return { ok: false, rel, reason: 'no probe extractable (body too short or all markup?)' };
  const slug = path.basename(rel).replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '');
  // Collection comes from the source path, not a guess: guides live under /guides/, articles under
  // /articles/. Hardcoding /articles/ made every guide report as unpublished, which reads exactly like a
  // deployment failure and is instead a broken probe -- the kind of false alarm that trains people to
  // ignore the checker.
  const coll = rel.startsWith('_guides/') ? 'guides' : 'articles';
  const url = `${BASE}/${coll}/${slug}/`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (res.status === 404) return { ok: false, rel, reason: '404 -- page not published' };
    if (!res.ok) return { ok: false, rel, reason: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { ok: false, rel, reason: `fetch failed: ${e.message}` };
  }
  const hay = normalize(html);
  if (!hay.includes(probe)) return { ok: false, rel, reason: `probe not found: "${probe}"` };
  if (/quiz-question/.test(html) !== /^quiz:/m.test(src.split(/^---[ \t]*$/m)[1] || '')) {
    return { ok: false, rel, reason: 'quiz presence disagrees between front matter and served page' };
  }
  return { ok: true, rel };
}

async function selfTest() {
  // The comparator must be able to fail: feed it known-good and known-drifted probes.
  const good = 'Every portfolio needs a written plan before money moves anywhere.';
  const drifted = 'Every portfolio needs a written plan before MONEYPREFIX moves anywhere.';
  const served = normalize('<p>Every portfolio needs a written plan before <em>money</em> moves anywhere.</p>');
  const pGood = normalize(good).slice(0, 60);
  const pBad = normalize(drifted).slice(0, 60);
  let bad = 0;
  if (!served.includes(pGood)) { console.error('  ✗ self-test: valid probe rejected (comparator too strict)'); bad++; }
  if (served.includes(pBad)) { console.error('  ✗ self-test: drifted probe matched (comparator too loose)'); bad++; }
  if (normalize('') !== '') { console.error('  ✗ self-test: empty input not normalized away'); bad++; }
  // Markdown dashes must compare equal across the typographic conversion kramdown performs.
  const dashServed = '<p>It reports what a company owned and owed on one date \u2014 the last day of a quarter \u2014 which is why every copy carries a date.</p>';
  const dashProbe = normalize('It reports what a company owned and owed on one date --- the last day of a quarter --- which is why every copy carries a date.');
  if (!normalize(dashServed).includes(dashProbe)) { console.error('  ✗ self-test: markdown dashes rejected after smart-character conversion (comparator too strict)'); bad++; }
  const dashDrift = normalize('It reports what a company owned and owed on one date --- the last day of a fiscal decade --- which is why every copy carries a date.');
  if (dashDrift && normalize(dashServed).includes(dashDrift)) { console.error('  ✗ self-test: drifted dashed sentence matched (comparator too loose)'); bad++; }
  // An empty probe must never be treated as a pass.
  if (!probeOf('## Heading only\n\n- list item\n')) { /* expected: null */ } else { console.error('  ✗ self-test: markup-only body yielded a probe'); bad++; }
  if (bad) { console.error(`\n${bad} self-test(s) failed`); process.exit(1); }
  console.log('  ✓ self-test: comparator distinguishes matching and drifted copy');
}

(async () => {
  if (argv.includes('--self-test')) return void selfTest();
  const list = targets();
  if (!list.length) { console.log('check-live: nothing to check'); return; }
  let pass = 0; const failures = [];
  for (const rel of list) {
    const r = await checkOne(rel);
    if (r.ok) { pass++; }
    else { failures.push(r); console.log(`  ✗ ${r.rel}\n      ${r.reason}`); }
  }
  console.log(`\ncheck-live: ${pass}/${list.length} served pages match committed copy (base ${BASE})`);
  if (failures.length) {
    console.error(`${failures.length} mismatch(es): content committed but not serving.`);
    process.exit(1);
  }
})();
