#!/usr/bin/env node
/**
 * Strip leaked AI writing-instruction scaffolding from published articles.
 *
 * Why this exists: the generator's cleanArticleContent() guarded every pattern with a
 * markdown-heading prefix (#+), but the model emits ATX-less BOLD headings - "**Introduction**",
 * "**Key Concepts**", "**Difficulty:**". None of those matched, so roughly 95% of the corpus
 * published visible internal instructions to teenage readers ("Introduction", "Why Should
 * Teens Care?", "Try It Yourself"), plus a duplicated title and a difficulty line already
 * shown in the front-matter badge.
 *
 * Rules are structural rather than an ever-growing phrase list: a short bold/heading line
 * that contains no sentence punctuation and matches a known instruction label is scaffolding.
 * Genuine section headings a writer chose ("How compound interest works") survive.
 *
 *   node scripts/clean-article-bodies.js --dry-run   # report only
 *   node scripts/clean-article-bodies.js             # rewrite files
 */

const fs = require('fs');
const path = require('path');

const { ARTICLES_DIR } = require('./lib/related-articles');

const dryRun = process.argv.includes('--dry-run');

// Labels that exist because they were in our prompt, not because a writer chose them.
// Compared case-insensitively after normalising punctuation.
const INSTRUCTION_LABELS = [
  'introduction',
  'hook the reader',
  'what is it',
  'what is',
  'clear definition',
  'definition',
  'why should teens care',
  'why should you care',
  'why care',
  'why this matters to you',
  'key concepts',
  'key takeaways',
  'key points',
  'main points',
  'summary',
  'conclusion',
  'final thoughts',
  'further reading',
  'resources',
  'additional resources',
  'recommended reading',
  'try it yourself',
  'hands-on activity',
  'activity',
  'real-world examples',
  'examples',
  'connect to their life',
  'break down the main ideas',
  'bullet points',
  // Deliberately NOT stripped: "Not financial advice" / "Disclaimer" are content on a
  // site read by minors. The article layout adds its own disclaimer block, but two corpus
  // articles contain no other disclaimer wording, so removing those headings would leave
  // the body claiming nothing about risk. Over-disclosing is the safe default here.
];

const NORMALISE = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LABEL_SET = new Set(INSTRUCTION_LABELS.map(NORMALISE));

/**
 * A line like "## Introduction", "**Introduction**", "**Introduction – Hook the Reader**",
 * or "**Difficulty:** Beginner" (note the colon can sit INSIDE the closing **).
 */
const HEADING_LINE = /^\s{0,3}(?:#{1,6}\s*)?\*{0,2}(.+?)\*{0,2}\s*:?\s*$/;

// Metadata lines duplicate front matter and can be long (a full tag list), so they are
// matched before the generic short-line guard below. Structurally unambiguous: a marked
// "Difficulty:"/"Tags:" line is never prose.
const METADATA_LINE = /^(difficulty|tags)\s*:/i;

/** Decide whether one source line is leaked scaffolding. Returns '' to delete, null to keep. */
function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const m = HEADING_LINE.exec(trimmed);
  if (!m) return null;

  // Strip any residual emphasis markers left by asymmetric bolding such as
  // "**Difficulty:** Beginner", where the closing ** lands after the colon.
  const inner = m[1].replace(/\*{1,2}|_{1,2}/g, '').trim();
  if (!inner) return null;

  // Only treat as scaffolding when visually marked (bold or #). Plain sentences stay.
  const isMarked = /^#{1,6}\s/.test(trimmed) || /\*\*|__/.test(trimmed);
  if (!isMarked) return null;

  // "Difficulty: Beginner" / "Tags: stocks, basics" duplicate the front matter.
  // Checked before the length guard: tag lists are routinely longer than prose fragments.
  if (METADATA_LINE.test(inner)) return '';

  // Must be short: real prose is not a single fragment. Long lines are content even when
  // they begin with a bolded label, e.g. "**Not financial advice.** This article ..." is
  // legitimately part of the body in some articles.
  if (trimmed.length > 60) return null;

  // Strip a trailing em/en dash tagline: "Introduction – Hook the Reader".
  const base = inner.split(/\s+[–—-]\s+/)[0];

  if (LABEL_SET.has(NORMALISE(inner)) || LABEL_SET.has(NORMALISE(base))) return '';

  // "Key Concepts to Understand" style: label followed by filler words, still a stub heading.
  const headWords = NORMALISE(base).split(' ').slice(0, 3).join(' ');
  if (LABEL_SET.has(headWords) && inner.split(/\s+/).length <= 5) return '';

  return null;
}

/** Remove a duplicated H1/title echo at the top of the body (front matter already renders it). */
function stripTitleEcho(lines, title) {
  if (!title) return { lines, removed: false };
  const want = NORMALISE(title);

  // Scan only the leading block, before real content begins.
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const t = lines[i].trim();
    if (!t) continue;

    const m = /^(?:#{1,6}\s*|\*\*)(.+?)(?:\s*\*\*)?$/.exec(t);
    const candidate = NORMALISE(m ? m[1] : t.replace(/^[=*]{3,}$/, ''));

    if (candidate === want) {
      // Consume the line plus any setext/atx underline that followed it, otherwise an
      // orphan "=====..." row is left behind as stray markup.
      let end = i + 1;
      while (
        end < lines.length &&
        /^\s*(?:[=*+-]{3,}|[-–—]\s*=+)\s*$/.test(lines[end])
      ) {
        end++;
      }
      // Also swallow blank lines introduced by the deletion, up to the next real line.
      while (end < lines.length && lines[end].trim() === '') end++;
      return { lines: lines.slice(0, i).concat(lines.slice(end)), removed: true };
    }
    // First non-title, non-blank line means the header block is over.
    if (!/^[=#*\s]*$/.test(t)) break;
  }
  return { lines, removed: false };
}

/** Collapse runs of 3+ blank lines left behind by deletions. */
function tidyBlankRuns(text) {
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '');
}

/**
 * Clean one article body. Front matter is never touched.
 * Returns { text, changes: string[] }.
 */
function cleanBody(raw) {
  const fence = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!fence) return { text: raw, changes: [] };

  const frontMatter = fence[0];
  let body = raw.slice(fence[0].length);

  const titleM = /^title:[ \t]*"?(.*?)"?[ \t]*$/m.exec(frontMatter);
  const title = titleM ? titleM[1] : null;

  const changes = [];
  let lines = body.split('\n');

  const echo = stripTitleEcho(lines, title);
  if (echo.removed) {
    lines = echo.lines;
    changes.push('removed title echo');
  }

  const kept = [];
  for (const line of lines) {
    const verdict = classifyLine(line);
    if (verdict === '') {
      const label = line.trim().slice(0, 42);
      changes.push(`dropped "${label}"`);
      continue;
    }
    kept.push(verdict === null ? line : verdict);
  }

  let out = kept.join('\n');
  // Leading whitespace/newlines exposed by deletions.
  out = out.replace(/^\s+/, '\n');
  out = tidyBlankRuns(out);

  return { text: frontMatter + out, changes };
}

function main() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error(`❌ No _articles directory at ${ARTICLES_DIR}`);
    process.exit(1);
  }

  console.log(`🧹 Cleaning article bodies${dryRun ? ' (dry run)' : ''}\n`);

  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md'));
  let changedFiles = 0;
  let totalDrops = 0;

  for (const file of files) {
    const filePath = path.join(ARTICLES_DIR, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const { text, changes } = cleanBody(original);

    if (text === original) continue;

    changedFiles++;
    totalDrops += changes.length;
    console.log(`✅ ${file} (${changes.length})`);
    for (const c of changes) console.log(`     · ${c}`);

    if (!dryRun) fs.writeFileSync(filePath, text);
  }

  console.log(
    `\n${dryRun ? '📋 Would clean' : '✅ Cleaned'} ${changedFiles} of ${files.length} files, ${totalDrops} scaffolding lines`
  );
  if (dryRun) console.log('Re-run without --dry-run to write changes.');
}

if (require.main === module) main();

module.exports = { cleanBody, classifyLine, stripTitleEcho, INSTRUCTION_LABELS };
