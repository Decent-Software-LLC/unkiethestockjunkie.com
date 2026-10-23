#!/usr/bin/env node
/**
 * Tests for scripts/clean-article-bodies.js.
 *
 * This tool rewrites every article file, so the risk is not "does it run" but
 * "did it quietly eat real prose". The word-preservation tests below are the point
 * of this file; the label tests are secondary.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { cleanBody, classifyLine } = require('./clean-article-bodies.js');

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

/** Minimal article with a body. */
function article(body, extraFm = '') {
  return [
    '---',
    'layout: article',
    'title: "Understanding Compound Interest"',
    'description: "Why starting early wins."',
    'date: 2026-01-01',
    'difficulty: beginner',
    'tags: ["compound-interest", "beginner"]',
    extraFm,
    '---',
    '',
    body,
    ''
  ].join('\n');
}

/** Body after the closing front-matter fence. indexOf('\n---', 4) is unsafe here: this
 *  file's fixtures include a blank line before '---', which can match the open fence area. */
function bodyOfArticle(s) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(s);
  return m ? s.slice(m[0].length) : s;
}

const SCAFFOLD = [
  '**Introduction**',
  '**What Is It?**',
  '**Why Should Teens Care?**',
  '**Key Concepts**',
  '**Real-World Examples**',
  '**Try It Yourself**',
  '**Key Takeaways**',
  '**Further Reading**',
  '**Difficulty: Beginner**',
  '**Tags: stocks, basics, beginner**'
].join('\n\n');

console.log('\nclean-article-bodies\n');

// --- scaffolding removal --------------------------------------------------

test('removes bolded instruction headings', () => {
  const src = article(SCAFFOLD + '\n\nCompound interest makes money grow over time.');
  const { text, changes } = cleanBody(src);
  for (const label of ['Introduction', 'What Is It?', 'Key Concepts', 'Further Reading', 'Try It Yourself']) {
    assert.ok(!text.includes(`**${label}**`), `${label} survived`);
  }
  assert.ok(changes.length >= 8, `expected many removals, got ${changes.length}`);
});

test('removes ATX instruction headings too', () => {
  const src = article('## Introduction\n\nReal prose here.\n\n## Key Takeaways\n\nMore prose.');
  const { text } = cleanBody(src);
  assert.ok(!/##\s*Introduction/i.test(text));
  assert.ok(!/##\s*Key\s+Takeaways/i.test(text));
  assert.ok(text.includes('Real prose here.'));
});

test('removes dash taglines ("Introduction – Hook the Reader")', () => {
  const src = article('**Introduction – Hook the Reader**\n\nBody copy survives.');
  const { text } = cleanBody(src);
  assert.ok(!/Hook the Reader/.test(text));
  assert.ok(text.includes('Body copy survives.'));
});

test('removes the duplicated title echo at the top of the body', () => {
  const src = article('**Understanding Compound Interest**\n====================\n\nActual opening paragraph.');
  const { text, changes } = cleanBody(src);
  assert.ok(changes.some((c) => /title echo/.test(c)), 'no title echo reported');
  // Title appears once (front matter) rather than twice in body markup.
  const body = bodyOfArticle(text);
  const occurrences = (body.match(/Understanding Compound Interest/g) || []).length;
  assert.strictEqual(occurrences, 0, `title still echoed ${occurrences}x in body`);
});

test('collapses blank runs left by deletions', () => {
  const src = article('**Introduction**\n\n\n\n**Key Concepts**\n\n\n\nSome content.');
  const { text } = cleanBody(src);
  assert.ok(!/\n{3,}/.test(bodyOfArticle(text)), 'triple newlines remain');
});

// --- what must SURVIVE ----------------------------------------------------

test('keeps genuine writer-chosen section headings', () => {
  const keepers = [
    '## The Math Made Simple',
    '### The 16-Year-Old Investor',
    '### How to Start With $50',
    '## When Compounding Works Against You'
  ];
  const src = article(keepers.join('\n\n') + '\n\nParagraph.');
  const { text } = cleanBody(src);
  for (const h of keepers) assert.ok(text.includes(h), `lost real heading: ${h}`);
});

test('keeps numbered sub-topic headings', () => {
  const src = article('### 1. Short Interest\n\nText.\n\n### 2. Margin Calls\n\nMore text.');
  const { text } = cleanBody(src);
  assert.ok(text.includes('### 1. Short Interest'), 'numbered heading lost');
  assert.ok(text.includes('### 2. Margin Calls'), 'numbered heading lost');
});

test('keeps disclaimer wording (minors-facing site should over-disclose)', () => {
  const src = article(
    'Body.\n\n**Disclaimer**\n\nNot financial advice; investing involves risk.\n\n**Not Financial Advice**\n\nEducational only.'
  );
  const { text } = cleanBody(src);
  assert.ok(text.includes('Disclaimer'), 'disclaimer heading removed');
  assert.ok(/Not financial advice/i.test(text), 'disclaimer prose removed');
});

test('long bolded sentences are treated as content, not scaffolding', () => {
  const long =
    '**The earlier you start investing, the more time your money has to compound and recover from downturns.**';
  const src = article(long + '\n\nFollowing paragraph.');
  const { text } = cleanBody(src);
  assert.ok(text.includes(long.trim()), 'genuine bolded sentence deleted');
});

test('removes the colon-inside-bold variant ("**Difficulty:** Beginner")', () => {
  // Regression: an earlier parser captured inner = "Difficulty:** Beginner", so the
  // residual ** defeated the ^difficulty anchor and 7 articles kept a stray difficulty line.
  const src = article(
    'Body opens here.\n\n**Difficulty:** Advanced\n\n**Tags:** value, beginner\n\nMore prose.'
  );
  const { text } = cleanBody(src);
  // Scope to the body: front matter legitimately carries difficulty/tags.
  const body = bodyOfArticle(text);
  assert.ok(!/Difficulty:/i.test(body), 'Difficulty line survived');
  assert.ok(!/Tags:/i.test(body), 'Tags line survived');
  assert.ok(body.includes('More prose.'));
});

test('inline bold inside a real sentence does not count as a heading', () => {
  const line = 'Compound **interest** grows faster when you start as a teenager.';
  const src = article(line + '\n\nNext paragraph.');
  const { text } = cleanBody(src);
  assert.ok(text.includes(line), 'prose with inline bold was deleted');
});

test('setext underlines separated by a blank line are removed (they render as <hr>)', () => {
  // Verified against Kramdown directly: "para\n\n-----\n\npara" -> <hr />. Those rules were
  // the visible debris left behind when scaffolding headings were deleted.
  const src = article(
    'First real paragraph about bonds.\n\n---------------\n\nSecond real paragraph about bonds.'
  );
  const { text } = cleanBody(src);
  assert.ok(!/^\s*-{3,}\s*$/m.test(bodyOfArticle(text)), 'orphan underline survived');
  const body = bodyOfArticle(text);
  assert.ok(body.includes('First real paragraph') && body.includes('Second real paragraph'), 'prose lost');
});

test('TIGHT setext underlines are KEPT (they become real h1/h2 headings)', () => {
  // Same Kramdown check: "Title\n-----" -> <h2>. Deleting these would erase structure.
  const src = article('Bonds explained\n-----------------\n\nBond prose here.');
  const { text } = cleanBody(src);
  const body = bodyOfArticle(text);
  const nonBlank = body.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(nonBlank[1] === '-----------------', 'tight underline was deleted: ' + JSON.stringify(nonBlank.slice(0, 3)));
  assert.ok(body.includes('Bonds explained'), 'heading text lost');
});

test('deleted heading takes its own underline with it (no orphan pair survives)', () => {
  const src = article('**Key Concepts**\n---------------\n\nActual concept text.');
  const { text } = cleanBody(src);
  const body = bodyOfArticle(text);
  assert.ok(!/Key Concepts/.test(body), 'label survived');
  assert.ok(!/^\s*-{3,}\s*$/m.test(body), 'its underline was orphaned');
  assert.ok(body.includes('Actual concept text.'));
});

test('front matter is never modified', () => {
  const src = article('**Introduction**\n\nProse.');
  const before = /^---[\s\S]*?\n---/.exec(src)[0];
  const after = /^---[\s\S]*?\n---/.exec(cleanBody(src).text)[0];
  assert.strictEqual(after, before, 'front matter changed');
});

test('idempotent: cleaning already-clean output changes nothing', () => {
  const src = article(SCAFFOLD + '\n\nReal content that must persist across passes.');
  const once = cleanBody(src).text;
  const twice = cleanBody(once);
  assert.strictEqual(twice.text, once, 'second pass altered the file');
  assert.strictEqual(twice.changes.length, 0, `second pass reported ${twice.changes.length} changes`);
});

// --- corpus-level safety -------------------------------------------------

const ARTICLES = path.join(__dirname, '..', '_articles');

test('corpus: every article has parseable front matter', () => {
  if (!fs.existsSync(ARTICLES)) return;

  // The compound-interest article had lost its closing "---" entirely (body text was glued on:
  // ---Imagine if your money...), so Jekyll treated the WHOLE file as body - no layout, no
  // title, no quiz, silently unstyled. Nothing else in the suite would have noticed because
  // every other test only inspects whatever follows a fence it could find.
  const FENCE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
  const broken = [];
  for (const file of fs.readdirSync(ARTICLES)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
    if (!FENCE.test(raw)) broken.push(file);
  }
  assert.deepStrictEqual(
    broken,
    [],
    `\n${broken.length} file(s) with no well-formed front-matter fence:\n  ${broken.join('\n  ')}`
  );
});


test('corpus: no prose words are lost on any article', () => {
  if (!fs.existsSync(ARTICLES)) return; // unit-only environment

  const bodyOf = (s) => bodyOfArticle(s);
  const tokens = (s) =>
    (bodyOf(s).match(/[A-Za-z][A-Za-z'’-]+/g) || []).map((w) => w.toLowerCase());

  // Removed lines must be explainable as scaffolding. Import the cleaner's own label set so
  // the two cannot drift apart (an earlier copy here omitted "try it yourself" and the
  // non-ASCII-hyphen variant of "real-world examples", failing on correct behaviour).
  const { INSTRUCTION_LABELS } = require('./clean-article-bodies.js');
  const normLabel = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/[\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim();
  const LABELS = new Set(INSTRUCTION_LABELS.map(normLabel));

  function isScaffoldingLine(line) {
    const inner = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
    if (/^(difficulty|tags)\b/i.test(inner)) return true;
    const base = normLabel(inner.split(/\s+[\u2013\u2014-]\s+/)[0]);
    if (LABELS.has(base)) return true;
    // Label + up-to-two filler words ("Key Concepts to Understand").
    const head = base.split(' ').slice(0, 3).join(' ');
    return LABELS.has(head);
  }

  const offenders = [];
  for (const file of fs.readdirSync(ARTICLES)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
    const { text } = cleanBody(raw);

    const beforeLines = bodyOf(raw)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const afterSet = new Set(
      bodyOf(text)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    );

    // Every dropped line must be recognisable scaffolding (or an underline/blank).
    for (const line of beforeLines) {
      if (afterSet.has(line)) continue;
      const isUnderline = /^[=*+-]{3,}$/.test(line);
      if (isUnderline || isScaffoldingLine(line)) continue;

      // A title echo is also acceptable - compare against front matter title.
      const tm = /^title:\s*"?(.*?)"?\s*$/m.exec(raw);
      const bare = line.replace(/^[#*\s]+|[\s*]+$/g, '').trim();
      if (tm && bare.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() ===
          tm[1].toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()) {
        continue;
      }

      offenders.push(`${file}: ${JSON.stringify(line.slice(0, 60))}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `\n${offenders.length} unexplained deletions:\n  ${offenders.slice(0, 12).join('\n  ')}`
  );
});

test('cleaning is idempotent (a rerun changes nothing already clean)', () => {
  // Guards a failure mode hit repeatedly while building this: an earlier version re-derived each
  // underline's context from post-deletion neighbours, so pass 2 deleted a divider pass 1 had
  // left as an <hr>, and the CLI reported "would clean 3 files" forever against clean content.
  // A non-idempotent cleaner makes it impossible to tell a genuine fix from churn on rerun.
  const fs = require('fs');
  for (const f of fs.readdirSync(ARTICLES).filter((x) => x.endsWith('.md'))) {
    const once = cleanBody(fs.readFileSync(path.join(ARTICLES, f), 'utf8')).text;
    assert.strictEqual(cleanBody(once).text, once, `${f} is not stable under repeated cleaning`);
  }
});

test('corpus: no scaffolding survives in any published body', () => {
  if (!fs.existsSync(ARTICLES)) return;

  const bodyOf = (s) => bodyOfArticle(s);
  const bad = [];

  // Files where a *bare, unmarked* metadata line survives in the body. cleanBody refuses to
  // delete unmarked plain text because "difficulty: advanced" and a real sentence starting
  // with a lowercase word are indistinguishable at scale - deleting those across 101 files
  // risks eating prose. These need a human edit; listing them here keeps the gate honest
  // (a NEW file appearing is a regression) without blocking every build.
  const KNOWN_BARE_METADATA = new Set([
    '2026-10-19-understanding-leveraged-etfs-the-math-that-eats-returns.md'
  ]);

  for (const file of fs.readdirSync(ARTICLES)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(ARTICLES, file), 'utf8');
    const { text } = cleanBody(raw); // what would actually be published
    const body = bodyOf(text);

    const labels = /\*\*\s*(Introduction|What Is It\??|Why Should Teens Care\??|Key Concepts|Key Takeaways|Try It Yourself|Further Reading|Real-World Examples|Hook the Reader)\s*\*\*\s*$/im;
    // Body-only: front matter legitimately carries difficulty:/tags: keys.
    const dupMeta = /^\s{0,3}(?:#{1,6}\s*|\*\*)?\s*(Difficulty|Tags)\s*:/im;

    if (labels.test(body)) bad.push(`${file}: scaffolding heading`);
    else if (/^(As an AI|I cannot assist|Language model)/im.test(body)) bad.push(`${file}: AI self-reference`);
    else if (dupMeta.test(body) && !KNOWN_BARE_METADATA.has(file)) {
      bad.push(`${file}: duplicated difficulty/tags`);
    }
  }

  // If someone cleans a known-bad file, shrink the allow-list rather than let it rot.
  const stillPresent = [...KNOWN_BARE_METADATA].filter((f) => fs.existsSync(path.join(ARTICLES, f)));
  const cleanedUp = stillPresent.filter((f) => {
    const raw = fs.readFileSync(path.join(ARTICLES, f), 'utf8');
    return !/^\s{0,3}(?:#{1,6}\s*|\*\*)?\s*(Difficulty|Tags)\s*:/im.test(bodyOf(cleanBody(raw).text));
  });
  assert.deepStrictEqual(
    bad,
    [],
    `\n${bad.length} publishable problems:\n  ${bad.slice(0, 8).join('\n  ')}\nRun: npm run clean-article-bodies`
  );

  if (cleanedUp.length) {
    console.log(
      `  ℹ ${cleanedUp.length} allow-listed bare-metadata file(s) now look clean; ` +
        `remove from KNOWN_BARE_METADATA: ${cleanedUp.join(', ')}`
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
