#!/usr/bin/env node
/**
 * Marketing/utility pages are held to the same honesty standard as articles.
 *
 * Motivation, said plainly: faq.md told readers "we publish new articles every day ... daily at
 * 10:17 AM UTC" long after the daily schedule had been retired, contact.md invited people to
 * "fill out the form below" for a form that has never existed, and newsletter.md quoted a
 * satisfied 16-year-old subscriber to a mailing list that was never built. Articles have gates,
 * claim checks and voice rules; the pages that describe the site to parents and beginners had
 * none of that, which is precisely how stale promises sat there unchallenged while prose got
 * scrubbed. These checks cover the gap: what the site says about itself must match the repository.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { collectionSlugs } = require('./lib/page-registry');

const ROOT = path.join(__dirname, '..');
const PAGES = ['faq.md', 'contact.md', 'about.md', 'articles.md', 'index.html', 'privacy.md'];
const READER_PAGES = PAGES;
const CHROME = ['_layouts/home.html', '_includes/footer.html', '_includes/header.html'];
const MAILBOX = 'hello@unkiethestockjunkie.com';

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

/**
 * Cadence wording that only held while generate-content.yml carried a schedule. Kept as one
 * shared list so the behavioural check and its negative control can never drift apart.
 */
const CADENCE_PATTERNS = [
  { re: /every single day/i, why: 'a daily guarantee while generation is manual-dispatch only' },
  { re: /(new|fresh) (article|lesson|content)s?[^<]{0,40}(every day|daily)/i, why: 'daily-article wording' },
  { re: /published daily/i, why: 'claims a fixed publication cadence' },
  { re: /delivered daily/i, why: 'claims a delivery cadence nothing performs' },
  { re: /\b\d{1,2}:\d{2}\s*(AM|PM)\b[^<]{0,20}UTC/i, why: 'names a publication time no workflow honours' },
  { re: /automated daily/i, why: 'describes automation that was deliberately retired' },
  { re: /daily new articles/i, why: 'promises a daily supply' },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Liquid relative_url expressions become the path they render to, so links can be resolved. */
function unwrapLiquid(text) {
  return text.replace(/\{\{-?\s*'([^']*)'\s*\|\s*relative_url\s*-?\s*\}\}/g, '$1');
}

/** Trailing-slash-insensitive route key. */
const routeKey = (p) => p.replace(/\/+$/, '') || '/';

/**
 * Every route Jekyll will emit, derived from tracked files rather than a hand-maintained list --
 * a literal list drifts into wishful thinking exactly like the aspirational slugs that once made
 * the link suite report green on dead navigation.
 */
function buildRouteSet() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const routes = new Set();
  const configs = ['_config.yml'];

  for (const file of tracked) {
    if (/^(assets|scripts|_data)\//.test(file)) continue;
    if (/^(_posts|_drafts)\//.test(file)) continue;
    if (/^_articles\//.test(file) || /^_guides\//.test(file)) continue; // handled via registry below
    if (/^_includes\//.test(file) || /^_layouts\//.test(file) || /^_sass\//.test(file)) continue;

    if (/\.md$/.test(file)) {
      if (/^README\.md$/i.test(file)) continue; // repository documentation, never rendered as a page
      let permalink = null;
      try {
        const raw = read(file);
        const m = /^permalink:[ \t]*["']?([^"'\r\n#]+)/m.exec(raw);
        if (m) permalink = m[1].trim();
      } catch (err) { /* unreadable tracked file: fall through to name-based route */ }
      const base = path.basename(file).replace(/\.md$/, '');
      const dir = path.dirname(file);
      const fallback = (dir === '.' ? '/' + base : '/' + dir + '/' + base) + '/';
      routes.add(routeKey(permalink || fallback));
      continue;
    }
    if (/\.html$/.test(file)) {
      // screeners/index.html renders at /screeners/, not /screeners/index -- comparing the whole
      // path against 'index' left every directory index unreachable in the route table.
      const dir = path.dirname(file);
      const base = path.basename(file, '.html');
      routes.add(routeKey(base === 'index' ? '/' + (dir === '.' ? '' : dir) : '/' + file.replace(/\.html$/, '')));
    }
  }

  for (const collection of ['articles', 'guides']) {
    for (const slug of collectionSlugs(collection, ROOT)) routes.add(routeKey('/' + collection + '/' + slug));
  }

  // Plugin-provided routes exist only while the plugin is enabled.
  const config = configs.map((f) => read(f)).join('\n');
  if (/jekyll-feed/.test(config)) routes.add(routeKey('/feed.xml'));
  if (/jekyll-sitemap/.test(config)) routes.add(routeKey('/sitemap.xml'));

  return { routes, tracked };
}

// ---------------------------------------------------------------------------

test('reader-facing pages make no publishing-cadence promise the repository cannot keep', () => {
  const offences = [];
  for (const page of [...READER_PAGES, ...CHROME]) {
    const text = unwrapLiquid(read(page));
    for (const { re, why } of CADENCE_PATTERNS) {
      const m = re.exec(text);
      if (m) offences.push(`${page}: "${m[0]}" (${why})`);
    }
  }
  if (offences.length) throw new Error(offences.join('; '));
});

test('no page attributes words to a reader who never said them', () => {
  // Testimonials are social proof. Attributing a quote to an unnamed teen is fabrication, not
  // decoration, and this audience is minors -- the one group whose invented endorsement we cannot
  // walk back with an errata note.
  const offences = [];
  for (const page of [...READER_PAGES, ...CHROME]) {
    const text = read(page);
    if (/<cite>/i.test(text)) offences.push(`${page}: <cite> attribution present`);
    if (/"/.test(text) && /blockquote/i.test(text) && /—|--\s*[A-Z][a-z]+,?\s*\d{1,2}/.test(text)) {
      offences.push(`${page}: blockquote attributed to a named person with an age`);
    }
  }
  if (offences.length) throw new Error(offences.join('; '));
});

test('every mailto in the source tree is the one mailbox that actually forwards', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(md|html)$/.test(f) && !f.startsWith('_site/'));
  const offenders = new Set();
  let seen = 0;
  for (const file of tracked) {
    const text = read(file);
    for (const m of text.matchAll(/mailto:([^"'?>\s]+)/g)) {
      const addr = m[1].replace(/[).,;:]+$/, ''); // markdown/prose punctuation is not part of the address
      seen++;
      if (addr.toLowerCase() !== MAILBOX) offenders.add(`${file}: ${addr}`);
    }
  }
  if (!seen) throw new Error('no mailto addresses found at all -- did address extraction break?');
  if (offenders.size) throw new Error(`unverified mailbox(es) advertised: ${[...offenders].join(', ')}`);
});

test('contact page states boundaries it can honour', () => {
  const text = read('contact.md');
  const required = [
    [/never as a recommendation/i, 'says replies explain mechanics rather than recommend'],
    [/Should I buy this right now\?/i, 'names the request it will decline'],
    [/government ID numbers/i, 'warns against sending sensitive identifiers'],
    [/trusted adult/i, 'routes real-world money problems to a person, not the inbox'],
  ];
  const missing = required.filter(([re]) => !re.test(text)).map(([, why]) => why);
  if (missing.length) throw new Error(`missing: ${missing.join('; ')}`);

  // The old page promised "2-3 business days" twice, in two different cards. A service level for a
  // hobby mailbox is a promise nobody is on duty to keep, and duplicates drift apart.
  const promises = text.match(/(business days|within \d+ days)/gi) || [];
  if (promises.length) throw new Error(`SLA language present (${promises.join(', ')})`);
  const soft = (text.match(/few days/gi) || []).length;
  if (soft !== 1) throw new Error(`expected exactly one soft response-time statement, found ${soft}`);
});

test('contact page does not advertise a form that does not exist', () => {
  const text = read('contact.md');
  const offences = [];
  for (const re of [/fill out the form/i, /coming soon/i, /<form[\s>]/i, /setting up our contact system/i]) {
    const m = re.exec(text);
    if (m) offences.push(m[0]);
  }
  if (offences.length) throw new Error(`phantom form copy: ${offences.join(', ')}`);
});

test('FAQ answers survive a reader with JavaScript disabled', () => {
  const text = read('faq.md');
  if (!/documentElement\.classList\.add\('faq-js'\)/.test(text)) {
    throw new Error("script never arms the collapsed state ('faq-js' class missing)");
  }
  // The class must be added synchronously: doing it inside DOMContentLoaded flashes every answer
  // open then shut, which reads as a broken page on slow connections.
  if (text.indexOf("classList.add('faq-js')") > text.indexOf("addEventListener('DOMContentLoaded'")) {
    throw new Error("'faq-js' is added after DOMContentLoaded, causing a flash-then-collapse");
  }
  const baseRule = /\.faq-answer\s*\{([^}]*)\}/.exec(text);
  if (!baseRule) throw new Error('.faq-answer rule not found');
  if (/max-height:\s*0/.test(baseRule[1])) {
    throw new Error('.faq-answer is collapsed by default, hiding content from no-JS readers');
  }
  if (!/\.faq-js \.faq-answer\s*\{[^}]*max-height:\s*0/.test(text)) {
    throw new Error('collapsing styles are not scoped behind .faq-js');
  }
});

test('no page sells email delivery that nobody operates', () => {
  const forbidden = [
    /straight to your inbox/i,
    /unsubscribe link/i,
    /subscribe now/i,
    /sign up today/i,
    /delivered daily/i,
    /new (article|lesson)s?[^<]{0,30}inbox/i,
  ];
  const offences = [];
  for (const page of [...READER_PAGES, ...CHROME]) {
    const text = unwrapLiquid(read(page));
    for (const re of forbidden) {
      const m = re.exec(text);
      if (m) offences.push(`${page}: "${m[0]}"`);
    }
  }
  if (offences.length) throw new Error(`email promises without a mailer behind them: ${offences.join('; ')}`);

  // Removing the promises is only honest if something that works was left in their place.
  if (!/\/feed\.xml/.test(unwrapLiquid(read('_layouts/home.html')))) {
    throw new Error('homepage offers no working subscription route (RSS) after dropping the mailing-list pitch');
  }
});

test('the newsletter page stays deleted', () => {
  // It sold subscriptions to a list that never existed, complete with an invented teen testimonial.
  // Re-adding it should be a decision, not a leftover from an old branch or editor buffer.
  if (fs.existsSync(path.join(ROOT, 'newsletter.md'))) {
    throw new Error('newsletter.md is back -- there is still no mailing list to advertise');
  }
  const references = [];
  for (const page of [...READER_PAGES, ...CHROME]) {
    if (/\/newsletter\b/.test(read(page))) references.push(page);
  }
  if (references.length) throw new Error(`links point at the deleted page: ${references.join(', ')}`);
});

test('privacy policy describes this codebase rather than a template', () => {
  const text = read('privacy.md');

  // Verbatim phrases from the version that described software this site does not run. Each one is a
  // claim of collection; reinstating any of them means a tracker was added without rewriting the policy.
  const removed = [
    'Anonymous Analytics',
    'If enabled, we use Google Analytics',
    'Opt-out of analytics tracking',
    'We use minimal cookies',
    'Contact Form Submissions',
    'Understand which articles are most helpful',
  ];
  const reintroduced = removed.filter((phrase) => text.includes(phrase));
  if (reintroduced.length) throw new Error(`stale collection claims are back: ${reintroduced.join(' | ')}`);

  // Nothing may claim analytics while none exists in the shipped source.
  const TRACKER_RE = /googletagmanager|gtag\(|google-analytics|plausible\.io|fathom|umami/i;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const trackerFiles = ['assets', '_includes', '_layouts']
    .flatMap(walk)
    .filter((f) => /\.(js|html)$/.test(f) && TRACKER_RE.test(read(path.relative(ROOT, f))));
  if (!trackerFiles.length && /\banalytics\b/i.test(text) && !/no analytics|nothing else from Google|no Analytics/i.test(text)) {
    throw new Error('policy mentions analytics but the site ships none');
  }

  const required = [
    [/server logs|hosting logs/i, 'hosting log disclosure'],
    [/fonts\.(googleapis|google)\.com|Google.*webfonts|webfonts/i, 'third-party font disclosure'],
    [/local storage/i, 'device-side storage disclosure'],
    [/forwarded|forwarding/i, 'what happens to emailed content'],
    [/deletion|deleted/i, 'route for asking removal'],
    [/not directed at children under 13/i, 'age framing consistent with the audience'],
  ];
  const missing = required.filter(([re]) => !re.test(text)).map(([, why]) => why);
  if (missing.length) throw new Error(`undisclosed reality: ${missing.join('; ')}`);
});

test('screener pages disclose the provenance and age of every number they print', () => {
  const files = fs.readdirSync(path.join(ROOT, 'screeners')).filter((f) => f.endsWith('.html') && f !== 'index.html');
  if (files.length < 6) throw new Error(`only ${files.length} screener pages found; expected one per strategy`);

  const lib = read('assets/js/fundamentals.js');
  if (!/function realDataLabel\(/.test(lib)) throw new Error('no central data-age label helper');
  if (!/isStale/.test(lib.slice(lib.indexOf('function realDataLabel')))) {
    throw new Error('label helper ignores staleness -- old data would still read as current');
  }

  const offenders = [];
  for (const file of files) {
    const text = read(path.join('screeners', file));
    if (!text.includes('realDataLabel(')) offenders.push(`${file}: status line never reports data age`);
    if (/Real data as of /.test(text)) offenders.push(`${file}: unqualified "Real data as of" wording restored`);
    if (!/Where these numbers come from/i.test(text)) offenders.push(`${file}: missing provenance disclosure`);
    if (/In a production environment/i.test(text)) offenders.push(`${file}: developer-facing placeholder copy`);
  }
  if (offenders.length) throw new Error(offenders.join('; '));
});

test('internal links on those pages resolve to routes Jekyll emits', () => {
  const { routes } = buildRouteSet();
  const dead = [];
  let scanned = 0;
  for (const page of [...READER_PAGES, ...CHROME]) {
    const text = unwrapLiquid(read(page));
    for (const m of text.matchAll(/href="(\/[^"#?]*)/g)) {
      scanned++;
      const target = routeKey(m[1]);
      if (target === routeKey('/')) continue;
      if (routes.has(target)) continue;
      if (fs.existsSync(path.join(ROOT, m[1].replace(/^\//, '')))) continue; // real asset path
      dead.push(`${page} -> ${m[1]}`);
    }
  }
  // A resolver that silently matches nothing would green-light every broken link ever written.
  if (scanned < 15) throw new Error(`only ${scanned} internal links inspected -- extraction is broken`);
  if (!routes.has(routeKey('/faq')) || !routes.has(routeKey('/screeners'))) {
    throw new Error('route table is missing pages that certainly exist; resolution cannot be trusted');
  }
  if (routes.has(routeKey('/this-route-does-not-exist-check'))) {
    throw new Error('route table accepts arbitrary paths, which makes this check meaningless');
  }
  if (dead.length) throw new Error(`links to routes nothing builds: ${dead.join(', ')}`);
});

test('the cadence patterns are not vacuous', () => {
  // Negative controls lifted verbatim from copy that shipped on this site unchallenged. A guard
  // that cannot reject the exact text it was written for is decoration.
  const historic = [
    'We publish new articles every day! Our automated system generates fresh educational content daily at 10:17 AM UTC.',
    '<strong>AI-Powered Daily Content:</strong> New articles every single day, generated with the help of AI',
    '<p>New articles every day, straight to your inbox. No spam, just pure investing education.</p>',
    '<li>Daily new articles</li>',
    '<span class="daily-badge">New article every day</span>',
  ];
  const survivors = historic.filter((line) => !CADENCE_PATTERNS.some(({ re }) => re.test(line)));
  if (survivors.length) throw new Error(`patterns let real copy through: ${JSON.stringify(survivors)}`);
});

test('marketing copy avoids the banned voice patterns', () => {
  const banned = [
    /young investor/i, /unlock(?:ing)? the/i, /game[- ]changer/i, /superpower/i, /delve/i,
    /embark/i, /trust us/i, /in this article/i, /financial freedom/i, /get rich/i,
  ];
  const offences = [];
  for (const page of [...READER_PAGES, ...CHROME]) {
    const text = read(page);
    for (const re of banned) {
      const m = re.exec(text);
      if (m) offences.push(`${page}: "${m[0]}"`);
    }
  }
  if (offences.length) throw new Error(offences.join('; '));
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}, 0);
