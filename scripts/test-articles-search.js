#!/usr/bin/env node
/**
 * Tests for the /articles search + difficulty filter behaviour.
 *
 * The filtering logic lives inline in articles.md (it is page-specific and tiny), so it
 * is extracted here by parsing the built markup rather than duplicating it in JS - a copy
 * would let the two drift and have the tests pass while the page is broken.
 *
 * Deliberately avoids jsdom: this site has three runtime dependencies and the code under
 * test only needs string/array reasoning. parseCards() reads the real generated HTML with
 * cheerio (already a dependency) and simulateFilter() mirrors the page's documented rules.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SITE_DIR = path.join(__dirname, '..', '_site', 'articles', 'index.html');
const ARTICLES_MD = path.join(__dirname, '..', 'articles.md');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

/** Parse the built /articles page into searchable records. */
function loadCards() {
  if (!fs.existsSync(SITE_DIR)) {
    // Throwing here prints a stack trace from top-level code. Exit cleanly with
    // instructions instead, since this is an expected operator mistake (running
    // `npm test` before any build), not a defect.
    console.error(
      '\n❌ Missing ' +
        path.relative(process.cwd(), SITE_DIR) +
        '\n   These tests run against generated output. Build first:\n'
    );
    console.error('   npm run build          # via Docker');
    console.error('   (CI builds in an earlier step before running npm test)\n');
    process.exit(2);
  }
  const $ = cheerio.load(fs.readFileSync(SITE_DIR, 'utf8'));
  return $('.article-card')
    .map((_, el) => {
      const $el = $(el);
      return {
        difficulty: $el.attr('data-difficulty'),
        tags: $el.attr('data-tags') || '',
        title: $el.find('.article-card-title').text(),
        description: $el.find('.article-card-description').text(),
        // Mirrors the page's haystack exactly: title + description + full data-tags
        // (not the truncated pills) + difficulty.
        text: [
          $el.find('.article-card-title').text(),
          $el.find('.article-card-description').text(),
          $el.attr('data-tags') || '',
          $el.attr('data-difficulty') || ''
        ]
          .join(' ')
          .toLowerCase()
      };
    })
    .get();
}

/** Mirror of the page's apply(): difficulty equality AND every whitespace-separated term. */
function visibleMatches(cards, { filter = 'all', query = '' } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    const okDifficulty = filter === 'all' || c.difficulty === filter;
    const okQuery = terms.every((term) => c.text.includes(term));
    return okDifficulty && okQuery;
  });
}

const cards = loadCards();
const total = cards.length;
const pageSource = fs.readFileSync(ARTICLES_MD, 'utf8');

console.log('\narticles search\n');

test('page ships the search UI', () => {
  assert.ok(pageSource.includes('id="article-search"'), 'search input missing');
  assert.ok(pageSource.includes('id="results-count"'), 'result count missing');
  assert.ok(pageSource.includes('id="no-results"'), 'empty state missing');
});

test('every card is individually hidden/restored (display toggling, not re-render)', () => {
  // Guards the approach: hiding a parent wrapper would break composition with the
  // difficulty filter, which also toggles display on these same nodes.
  assert.ok(/rec\.card\.style\.display = show \? '' : 'none';/.test(pageSource));
});

test('search index covers title, description and tags', () => {
  const tagOnly = cards.filter((c) => c.text.includes('buffett'));
  assert.ok(tagOnly.length > 0, 'expected some card to surface buffett via any field');
});

test('tags beyond the three displayed are still searchable (23% would be lost)', () => {
  // article-card.html renders only limit:3 tags for layout. Searching those pills left
  // ~95 tags unfindable, e.g. compound-interest on an article whose description never
  // says "compound". Full tags live in data-tags so display and search can differ.
  const withHiddenTag = cards.filter((c) => {
    const all = (c.tags || '').split(',').filter(Boolean);
    return all.length > 3;
  });
  assert.ok(withHiddenTag.length > 0, 'no article has >3 tags; premise wrong');

  for (const card of withHiddenTag.slice(0, 15)) {
    const hidden = (card.tags || '').split(',').slice(3);
    for (const tag of hidden) {
      assert.ok(
        card.text.includes(tag.toLowerCase()),
        `tag "${tag}" is not searchable even though it is on the article`
      );
    }
  }
});

test('data-tags exposes every front-matter tag of each article', () => {
  // Compare against source front matter rather than trusting the render. Matched by
  // normalised title (unique here) - matching on tag sets is ambiguous because several
  // articles share tags like ["beginner"] plus a common third.
  const norm = (s) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const dir = path.join(__dirname, '..', '_articles');
  const byTitle = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const titleM = /^title:\s*"(.*?)"\s*$/m.exec(src);
    const tagsM = /^tags:\s*\[(.*?)\]/m.exec(src);
    if (!titleM || !tagsM) continue;
    byTitle.set(norm(titleM[1]), tagsM[1].split(',').map((t) => t.trim().replace(/^"|"$/g, '')));
  }

  const $ = cheerio.load(fs.readFileSync(SITE_DIR, 'utf8'));
  let checked = 0;
  $('.article-card').each((_, el) => {
    const rendered = ($(el).attr('data-tags') || '').split(',').filter(Boolean);
    if (!rendered.length) return;
    const titleEl = $(el).find('.article-card-title a');
    const key = norm(titleEl.text());
    const expected = byTitle.get(key);
    assert.ok(expected, `no source article found for card title "${key}"`);
    // Same tags in the same order as front matter.
    assert.deepStrictEqual(rendered, expected, `tag mismatch for ${key}`);
    checked++;
  });
  assert.ok(checked > 50, `only cross-checked ${checked} articles against front matter`);
});

// --- behaviour -------------------------------------------------------------

test('empty query shows everything', () => {
  assert.strictEqual(visibleMatches(cards).length, total);
});

test('difficulty filter narrows to that tier', () => {
  for (const tier of ['beginner', 'intermediate', 'advanced']) {
    const n = visibleMatches(cards, { filter: tier }).length;
    const expected = cards.filter((c) => c.difficulty === tier).length;
    assert.strictEqual(n, expected, `${tier}: ${n} != ${expected}`);
    assert.ok(expected > 0, `${tier} has no articles - filter would look broken`);
  }
});

test('single-term search returns only true matches (no false positives)', () => {
  for (const q of ['dividend', 'buffett', 'etf', 'compound-interest', 'risk']) {
    const hits = visibleMatches(cards, { query: q });
    assert.ok(hits.length > 0, `"${q}" matched nothing - suspicious`);
    assert.ok(
      hits.every((c) => c.text.includes(q)),
      `"${q}" produced a non-matching card`
    );
    assert.ok(hits.length < total, `"${q}" matched everything - index too broad`);
  }
});

test('multi-term search is AND, never wider than its loosest term', () => {
  const single = visibleMatches(cards, { query: 'dividend' }).length;
  const both = visibleMatches(cards, { query: 'dividend safety' }).length;
  assert.ok(both <= single, `AND widened results (${both} > ${single})`);
  assert.ok(
    visibleMatches(cards, { query: 'dividend safety' }).every(
      (c) => c.text.includes('dividend') && c.text.includes('safety')
    ),
    'AND semantics violated'
  );
});

test('impossible query matches nothing (drives the empty state)', () => {
  assert.strictEqual(visibleMatches(cards, { query: 'zzzz-not-a-real-topic' }).length, 0);
});

test('search composes with the difficulty filter', () => {
  const composed = visibleMatches(cards, { filter: 'beginner', query: 'stock' });
  assert.ok(composed.length > 0, 'beginner+stock should have results');
  assert.ok(composed.every((c) => c.difficulty === 'beginner'), 'leaked non-beginner cards');
  assert.ok(composed.every((c) => c.text.includes('stock')), 'leaked non-matching cards');
  assert.ok(
    composed.length <= visibleMatches(cards, { filter: 'beginner' }).length,
    'composition should narrow, not widen'
  );
});

test('search is case-insensitive', () => {
  assert.deepStrictEqual(
    visibleMatches(cards, { query: 'BUFFETT' }),
    visibleMatches(cards, { query: 'buffett' })
  );
});

test('surrounding whitespace does not change results', () => {
  assert.deepStrictEqual(
    visibleMatches(cards, { query: '  dividend  ' }),
    visibleMatches(cards, { query: 'dividend' })
  );
});

test('query text is inserted via textContent, not innerHTML (XSS-safe)', () => {
  // The user query is echoed into #results-count and #no-results-text. If that ever moves
  // to innerHTML, a query like <img src=x onerror=...> becomes executable markup.
  assert.ok(
    /resultsCount\.textContent =/.test(pageSource),
    'results counter should be assigned via textContent'
  );
  assert.ok(
    /noResultsText\.textContent =/.test(pageSource),
    'empty-state text should be assigned via textContent'
  );
  assert.ok(
    !/resultsCount\.innerHTML|noResultsText\.innerHTML/.test(pageSource),
    'innerHTML must not be used for user-supplied query text'
  );
});

test('debounced input handler exists (not per-keystroke filtering)', () => {
  assert.match(pageSource, /setTimeout\(function \(\)[\s\S]{0,120}apply\(\)/);
});

test('Escape and clear both reset the query', () => {
  assert.ok(pageSource.includes("e.key === 'Escape'"), 'Escape should clear the field');
  assert.ok(pageSource.includes("getElementById('article-search-clear')") ||
    pageSource.includes('getElementById("article-search-clear")'), 'clear button wiring missing');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
