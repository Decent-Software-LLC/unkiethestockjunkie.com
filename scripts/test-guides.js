#!/usr/bin/env node
/**
 * Validate the guides collection against what _layouts/guide.html actually consumes.
 *
 * Motivation, said plainly: the first guide authored here cited two government URLs that
 * looked completely plausible and both returned 404 - one IRS path that resolved to a real
 * page turned out to be about amended tax returns, not custodial accounts. Written from
 * memory, URLs drift or never existed. So every external link is checked over HTTP, and the
 * TOC/anchor contract is checked structurally because the layout builds #step-N links from
 * front matter while the body has to supply matching ids by hand - a mismatch produces a
 * table of contents where every link silently does nothing.
 *
 * Network checks are skipped when offline (SKIP_NETWORK=1) so CI without egress still gets
 * the structural guarantees.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GUIDES_DIR = path.join(__dirname, '..', '_guides');
const SITE_DIR = path.join(__dirname, '..', '_site', 'guides');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`  ✗ ${name}\n      ${err.message}`);
    });
}

/** Minimal YAML-subset reader for the shapes used in guide front matter. */
function parseFrontMatter(raw) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!m) return null;
  // Guides use scalars plus lists of {title,url,description} / {title,summary}. Rather than
  // depend on a YAML lib, extract exactly what the layout reads and validate structure by
  // line-walking. Anything we cannot parse is treated as an error, not skipped.
  const fm = m[1];
  const get = (key) => {
    const r = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm);
    return r ? r[1].trim().replace(/^"(.*)"$/, '$1') : undefined;
  };
  const blockList = (key) => {
    const start = new RegExp(`^${key}:[ \\t]*$`, 'm').exec(fm);
    if (!start) return undefined;
    const lines = fm.slice(start.index + start[0].length).split(/\r?\n/);
    const items = [];
    let cur = null;
    for (const l of lines) {
      if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(l)) break; // next top-level key
      const item = /^  - ([A-Za-z_][A-Za-z0-9_]*):[ \t]?(.*)$/.exec(l);
      const cont = /^    ([A-Za-z_][A-Za-z0-9_]*):[ \t]?(.*)$/.exec(l);
      if (item) {
        cur = {};
        cur[item[1]] = unq(item[2]);
        items.push(cur);
      } else if (cont && cur) {
        cur[cont[1]] = unq(cont[2]);
      }
    }
    return items.length ? items : undefined;
  };
  const unq = (s) => String(s).trim().replace(/^"(.*)"$/s, '$1').replace(/""/g, '"');
  return { raw: fm, get, blockList };
}

const REQUIRED_SCALARS = ['title', 'description', 'difficulty', 'time'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

function files() {
  if (!fs.existsSync(GUIDES_DIR)) return [];
  return fs.readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'));
}

async function headStatus(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36' }
    });
    return res.status;
  } catch (e) {
    return 0; // network error / timeout
  }
}

(async () => {
  console.log('\nguides collection\n');

  const list = files();

  await test('the _guides directory exists and has content', () => {
    if (!list.length) throw new Error('no guides found - the layout and /guides hub would render empty');
  });

  // Tests below that read built output are only meaningful when a build exists, and silently
  // skipping them is how this suite once reported "8 passed" against a build that had actually
  // died on a YAML error. So no _site is an error unless you explicitly opt out.
  const requireSite = process.env.REQUIRE_SITE !== '0';
  await test('_site/guides exists (the jekyll build ran and succeeded)', () => {
    if (!fs.existsSync(SITE_DIR) && requireSite) {
      throw new Error('no _site/guides - run `npm run build` first (or set REQUIRE_SITE=0 to skip build checks)');
    }
  });

  const parsed = new Map();
  await test('every guide has a well-formed front-matter fence', () => {
    const bad = list.filter((f) => !parseFrontMatter(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8')));
    if (bad.length) throw new Error(`missing/corrupt front matter: ${bad.join(', ')}`);
    list.forEach((f) => {
      parsed.set(f, parseFrontMatter(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8')));
    });
  });

  await test('required fields present with valid values', () => {
    const problems = [];
    for (const [f, fm] of parsed) {
      if (!fm) continue;
      for (const k of REQUIRED_SCALARS) {
        const v = fm.get(k);
        if (!v) problems.push(`${f}: missing "${k}"`);
      }
      const d = fm.get('difficulty');
      if (d && !DIFFICULTIES.includes(d.toLowerCase())) problems.push(`${f}: difficulty "${d}" not in ${DIFFICULTIES.join('/')}`);
      const t = Number(fm.get('time'));
      if (fm.get('time') && (!Number.isFinite(t) || t <= 0 || t > 120)) problems.push(`${f}: time "${fm.get('time')}" is not a sane minute count`);
    }
    if (problems.length) throw new Error(`\n   ` + problems.join('\n   '));
  });

  await test('steps exist and each has a title (the TOC renders step.title)', () => {
    const problems = [];
    for (const [f, fm] of parsed) {
      if (!fm) continue;
      const steps = fm.blockList('steps');
      if (!steps) { problems.push(`${f}: no steps (layout renders an empty "Steps" nav)`); continue; }
      if (steps.length < 3) problems.push(`${f}: only ${steps.length} steps for a step-by-step guide`);
      steps.forEach((s, i) => {
        if (!s.title) problems.push(`${f}: step ${i + 1} has no title`);
        if (!s.summary) problems.push(`${f}: step ${i + 1} has no summary`);
      });
    }
    if (problems.length) throw new Error(`\n   ` + problems.join('\n   '));
  });

  await test('front matter avoids constructs our reader accepts but Psych rejects', () => {
    // Our front-matter reader is deliberately naive, so it can accept input Ruby will refuse:
    // a backslash-dollar inside a double-quoted scalar reads fine here yet makes Psych abort
    // the whole build with "found unknown escape character". Check what our reader is blind to
    // rather than trusting it to behave like a real YAML parser.
    const problems = [];
    for (const [f, fm] of parsed) {
      if (!fm) continue;
      const badEsc = fm.raw.match(/\\[^"\\nrt]/g);
      if (badEsc) problems.push(`${f}: suspicious backslash escapes: ${[...new Set(badEsc)].slice(0, 3).join(' ')}`);
    }
    if (problems.length) throw new Error('\n   ' + problems.join('\n   '));
  });

  await test('TOC anchors resolve: every step-N has a matching id in the body', () => {
    // The layout emits <a href="#step-N"> from front matter but the body must carry the
    // anchor. A missing id gives a table of contents where clicking any entry does nothing.
    if (!fs.existsSync(SITE_DIR)) return; // covered by the _site test
    const problems = [];
    for (const f of list) {
      const dir = path.join(SITE_DIR, f.replace(/\.md$/, ''));
      const htmlPath = path.join(dir, 'index.html');
      if (!fs.existsSync(htmlPath)) continue;
      const html = fs.readFileSync(htmlPath, 'utf8');
      const wanted = [...html.matchAll(/href="#(step-\d+)"/g)].map((m) => m[1]);
      const have = new Set([...html.matchAll(/id="(step-\d+)"/g)].map((m) => m[1]));
      const missing = wanted.filter((w) => !have.has(w));
      if (missing.length) problems.push(`${f}: TOC targets with no anchor: ${missing.join(', ')}`);
    }
    if (problems.length) throw new Error(`\n   ` + problems.join('\n   '));
  });

  await test('guides are published at /guides/<slug>/', () => {
    if (!fs.existsSync(SITE_DIR)) return; // covered by the _site test
    const missing = list.filter((f) => !fs.existsSync(path.join(SITE_DIR, f.replace(/\.md$/, ''), 'index.html')));
    if (missing.length) throw new Error(`not built: ${missing.join(', ')}`);
  });

  await test('footer disclaimer is present (minors-facing site)', () => {
    if (!fs.existsSync(SITE_DIR)) return; // covered by the _site test
    const missing = list.filter((f) => {
      const p = path.join(SITE_DIR, f.replace(/\.md$/, ''), 'index.html');
      if (!fs.existsSync(p)) return false;
      return !/educational purposes only/i.test(fs.readFileSync(p, 'utf8'));
    });
    if (missing.length) throw new Error(`no disclaimer: ${missing.join(', ')}`);
  });

  // --- external links ----------------------------------------------------
  const external = [];
  for (const [f, fm] of parsed) {
    if (!fm) continue;
    for (const item of fm.blockList('further_reading') || []) {
      if (item.url) external.push({ file: f, url: item.url, title: item.title });
    }
    const bodyText = fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8');
    for (const m of bodyText.matchAll(/\(((?:https?:\/\/)[^)\s]+)\)/g)) external.push({ file: f, url: m[1], title: '(inline)' });
  }

  if (process.env.SKIP_NETWORK) {
    console.log(`  - skipped ${external.length} external link check(s) (SKIP_NETWORK=1)`);
  } else {
    await test(`all ${external.length} external links resolve (200/301/302)`, async () => {
      if (!external.length) return;
      const results = await Promise.all(external.map(async (e) => ({ ...e, status: await headStatus(e.url) })));
      const dead = results.filter((r) => r.status === 0 || r.status >= 400);
      if (dead.length) {
        throw new Error(
          `\n   ` + dead.map((d) => `${d.status || 'ERR'} ${d.url}  (in ${d.file}, "${d.title}")`).join('\n   ') +
          `\n   Do not ship links written from memory - verify each URL resolves AND says what you claim.`
        );
      }
    });
  }

  await test('article -> guide callout targets exist and are used', () => {
    // _data/guide-links.json is keyed by article slug and names guides by title. Both sides
    // can drift: rename an article (slug changes) or retitle a guide (lookup fails) and the
    // include silently renders nothing - no error anywhere, just a missing cross-link.
    const dataPath = path.join(__dirname, '..', '_data', 'guide-links.json');
    if (!fs.existsSync(dataPath)) return;
    const map = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const problems = [];

    const guideTitles = new Set();
    for (const f of list) {
      const fm = parsed.get(f);
      if (fm) guideTitles.add(fm.get('title'));
    }

    const articleSlugs = new Set(
      fs.readdirSync(path.join(__dirname, '..', '_articles'))
        .filter((x) => x.endsWith('.md'))
        .map((x) => x.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, ''))
    );

    for (const [slug, entry] of Object.entries(map)) {
      if (!articleSlugs.has(slug)) problems.push(`guide-links.json key "${slug}" matches no article file`);
      if (!entry.guide || !guideTitles.has(entry.guide)) {
        problems.push(`"${slug}" points at guide "${entry.guide}" which no guide is titled`);
      }
      if (!entry.teaser || entry.teaser.length < 12) problems.push(`"${slug}" has no real teaser text`);
    }
    if (problems.length) throw new Error('\n   ' + problems.join('\n   '));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
