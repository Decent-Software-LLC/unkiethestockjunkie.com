#!/usr/bin/env node
/**
 * One-off backfill of `related_articles` across the existing corpus.
 *
 * _layouts/article.html only renders its "Continue Learning" block when a page
 * defines related_articles, but the generator never wrote that key - so the
 * retention component was absent from every published article (verified: 0 of 101
 * pages rendered it). This attaches it.
 *
 * Deterministic and idempotent: safe to re-run, byte-identical on repeat passes
 * (asserted by scripts/test-related-articles.js). Front matter only - bodies are
 * never rewritten, except repairing the one known fence corruption that otherwise
 * stops Jekyll from reading the key at all.
 *
 *   node scripts/backfill-related-articles.js           # write
 *   node scripts/backfill-related-articles.js --dry-run # report only
 */

const fs = require('fs');
const path = require('path');
const {
  ARTICLES_DIR,
  loadArticleIndex,
  rankRelated,
  splitFrontMatter,
  toFrontMatter
} = require('./lib/related-articles');

const dryRun = process.argv.includes('--dry-run');

// Removes a previously-written related_articles block so a re-run replaces it
// instead of appending a duplicate.
//
// Done as a structural line walk rather than one big regex. An earlier regex draft
// required every continuation line to end in a newline, so whenever the written
// block was trimmed (no trailing newline) its final "    description:" line survived
// each run and accumulated - producing a file that changed on every pass. Walking
// lines makes "indented, and belongs to the block we just wrote" explicit and testable.
function stripRelatedBlock(frontMatter) {
  const lines = frontMatter.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    // The key only counts at column 0: indented occurrences are nested content.
    if (/^related_articles:[ \t]*$/.test(lines[i])) {
      i++; // skip the key itself
      // Consume the indented list body: items and their child keys.
      while (i < lines.length && /^[ \t]+\S/.test(lines[i])) i++;
      continue;
    }
    out.push(lines[i]);
    i++;
  }

  return out.join('\n');
}

// A leaked "### Difficulty:" heading that cleanArticleContent() stripped only
// partially, fused onto the closing fence. Built from pieces to keep the escaping
// readable (and to avoid embedding raw newlines inside a regex literal).
const LEAKED_HEADING = String.raw`###[ \t]*(?:Difficulty|Tags):[^\r\n]*`;
const GLUED_FENCE = new RegExp(
  String.raw`^[\r\n]*---[ \t]*` + LEAKED_HEADING + String.raw`\r?\n(?:` + LEAKED_HEADING + String.raw`\r?\n)?`
);

/**
 * Repair the "---### Difficulty: Beginner" corruption produced by generate-article.js's
 * cleanArticleContent(): it removed a leaked heading's text but left the remainder fused
 * to the closing front-matter fence with no newline. Jekyll cannot parse front matter
 * from that line onward, so any key added to such a file is silently dropped from the
 * rendered page - which is exactly how one article stayed without links after backfill.
 *
 * Only matches a fence immediately followed by leaked Difficulty/Tags headings; ordinary
 * fences are returned unchanged. splitFrontMatter keeps the newline preceding the fence,
 * hence the leading [\r\n]*.
 */
function repairGluedFence(trailing) {
  return trailing.replace(GLUED_FENCE, '\n---\n\n');
}

function main() {
  console.log(`🔗 Backfilling related articles${dryRun ? ' (dry run)' : ''}\n`);

  const corpus = loadArticleIndex();
  if (corpus.length === 0) {
    console.error(`❌ No articles found in ${ARTICLES_DIR}`);
    process.exit(1);
  }
  console.log(
    `Loaded ${corpus.length} articles from ${path.relative(process.cwd(), ARTICLES_DIR)}\n`
  );

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let repairedFences = 0;

  for (const article of corpus) {
    const filePath = path.join(ARTICLES_DIR, article.file);
    const original = fs.readFileSync(filePath, 'utf8');

    const parts = splitFrontMatter(original);
    if (!parts) {
      console.warn(`⚠️  Skipping (no front matter): ${article.file}`);
      skipped++;
      continue;
    }

    const related = rankRelated(article, corpus);
    const block = toFrontMatter(related);

    if (!block) {
      // Nothing strong enough to recommend. Leave the file alone rather than
      // shipping weak links just to fill the slot.
      console.log(`   no strong matches -> ${article.file}`);
      skipped++;
      continue;
    }

    const cleaned = stripRelatedBlock(parts.frontMatter).replace(/\s+$/, '');
    const trailing = repairGluedFence(parts.trailing);
    if (trailing !== parts.trailing) repairedFences++;

    const rebuilt = `${parts.leading}${cleaned}\n${block.trimEnd()}${trailing}`;

    if (rebuilt === original) {
      unchanged++;
      continue;
    }

    if (!dryRun) fs.writeFileSync(filePath, rebuilt);
    updated++;
    const note = trailing !== parts.trailing ? ' (+repaired fence)' : '';
    console.log(`✅ ${article.file}  (+${related.length} related${note})`);
  }

  console.log(
    `\n${dryRun ? '📋 Would update' : '✅ Updated'} ${updated}, ` +
      `unchanged ${unchanged}, skipped ${skipped}, ` +
      `fences repaired ${repairedFences} (of ${corpus.length})`
  );
  if (dryRun) console.log('Re-run without --dry-run to write changes.');
}

main();
