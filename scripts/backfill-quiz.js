#!/usr/bin/env node
/**
 * Attach / update `quiz:` front matter on beginner articles from a JSON sidecar.
 *
 *   node scripts/backfill-quiz.js --dry-run
 *   node scripts/backfill-quiz.js                  # apply scripts/quiz-content.json
 *
 * Why a sidecar instead of editing 40 markdown files by hand: each quiz is two questions
 * plus an answer key, and a typo in one key silently teaches teenagers a false rule about
 * money. Keeping them in one reviewable JSON file means the whole batch is validated
 * together (scripts/lib/quiz.js) before anything touches _articles/, and re-running is
 * idempotent rather than a fresh diff every time.
 *
 * The sidecar is also the artefact a human should read for financial accuracy - the code
 * can prove the shape is valid, but only a person can prove "dollar-cost averaging removes
 * risk" is not being taught as true.
 */

const fs = require('fs');
const path = require('path');

const { validateQuiz } = require('./lib/quiz');

const ARTICLES_DIR = path.join(__dirname, '..', '_articles');
const SIDECAR = path.join(__dirname, 'quiz-content.json');

const dryRun = process.argv.includes('--dry-run');

/** Insert or replace the `quiz:` block immediately before `related_articles:` (or at EOF). */
function setQuizFrontMatter(raw, quiz) {
  const fence = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!fence) throw new Error('no front matter fence found');

  let fm = fence[1];
  const block = toYaml(quiz);

  // Replace an existing quiz: block (label through the last indented/blank line that
  // belongs to it), otherwise insert before related_articles: to keep key order stable.
  const existing = /^(quiz:[ \t]*\r?\n(?:[ \t]+[^\r\n]*\r?\n|\r?\n)*)/m.exec(fm);
  if (existing) {
    fm = fm.replace(existing[1], block + '\n');
  } else if (/^related_articles:/m.test(fm)) {
    fm = fm.replace(/^related_articles:/m, block + '\nrelated_articles:');
  } else {
    fm = `${fm}\n${block}`;
  }

  return raw.slice(0, fence.index) + `---\n${fm}\n---` + raw.slice(fence.index + fence[0].length);
}

/** Emit YAML matching the corpus style (double-quoted strings, 2-space indent). */
function toYaml(quiz) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const q = (s) => `"${esc(s)}"`;
  const lines = ['quiz:'];
  for (const item of quiz) {
    lines.push(`  - question: ${q(item.question)}`);
    // Must be a flow sequence: `options: "a", "b"` is NOT valid YAML and made Psych abort
    // the whole build under --strict_front_matter. Brackets are required.
    lines.push(`    options: [${item.options.map(q).join(', ')}]`);
    lines.push(`    answer: ${item.answer}`);
    if (item.why) lines.push(`    why: ${q(item.why)}`);
  }
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(SIDECAR)) {
    console.error(`❌ Missing ${path.relative(process.cwd(), SIDECAR)}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SIDECAR, 'utf8'));
  const slugs = Object.keys(data);
  console.log(`📝 Applying quizzes to ${slugs.length} articles${dryRun ? ' (dry run)' : ''}\n`);

  // Validate everything before writing anything: a partial batch is worse than none.
  const problems = [];
  for (const slug of slugs) {
    const file = fs.readdirSync(ARTICLES_DIR).find((f) => f.endsWith(`-${slug}.md`) || f === `${slug}.md`);
    if (!file) {
      problems.push(`${slug}: no article file found`);
      continue;
    }
    const { ok, errors } = validateQuiz(data[slug]);
    if (!ok) problems.push(...errors.map((e) => `${slug}: ${e}`));
  }

  if (problems.length) {
    console.error(`❌ Refusing to write; ${problems.length} problem(s):\n`);
    problems.forEach((p) => console.error('   ' + p));
    process.exit(1);
  }

  let changed = 0;
  for (const slug of slugs) {
    const file = fs.readdirSync(ARTICLES_DIR).find((f) => f.endsWith(`-${slug}.md`) || f === `${slug}.md`);
    const filePath = path.join(ARTICLES_DIR, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const next = setQuizFrontMatter(original, data[slug]);
    if (next === original) continue;
    changed++;
    console.log(`✅ ${slug}`);
    if (!dryRun) fs.writeFileSync(filePath, next);
  }

  console.log(`\n${dryRun ? '📋 Would update' : '✅ Updated'} ${changed} of ${slugs.length} articles.`);
  if (dryRun) console.log('Re-run without --dry-run to write.');
}

if (require.main === module) main();

module.exports = { setQuizFrontMatter, toYaml };
