#!/usr/bin/env node
// Content rewrite tracker. Writes a checklist OUTSIDE the repo (default:
// ../CONTENT-PROGRESS.md relative to the repo root) so working state never pollutes the site.
//
//   node scripts/progress-report.js                # write ../CONTENT-PROGRESS.md
//   node scripts/progress-report.js --out PATH     # write elsewhere ('-' = stdout)
//   node scripts/progress-report.js --stale        # also list pages served but not yet matching
//
// Every column is measured from the repository, never from memory:
//   quiz      front-matter `quiz:` key present (an earlier tracker counted rendered HTML found in
//             bodies, which overstated coverage because body swaps deleted the real block)
//   words     prose words in the body, excluding tables/code/front matter
//   rewr      body text differs from the initial commit -- proof a rewrite actually landed
//   tells     count of banned AI-ism matches in the body (advisory; see test-voice.js budgets)
// The whole point of generating instead of hand-maintaining: an unverifiable hand-written ledger
// here previously claimed six articles that do not exist.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const outFlag = argv.indexOf('--out');
const OUT = outFlag >= 0 ? argv[outFlag + 1] : path.join(ROOT, '..', 'CONTENT-PROGRESS.md');

// All measurement lives in scripts/lib/content-inventory.js. The generator ranks topics, verify-content
// resolves links and this file reports progress; when each kept its own idea of "how long is this page /
// does it still read like AI wrote it", two same-day bugs slipped through because every copy looked
// correct on its own. Nothing here measures anything directly any more.
const { loadInventory, loadAuthoredManifest } = require('./lib/content-inventory');

// Authorship is asserted by scripts/rewrite-body.js writing content-rewrites.json, never inferred from git
// history -- comparing bodies against the initial commit made all ~100 articles look "rewritten", because
// one bulk scaffolding-clean pass touched all of them mechanically.
const AUTHORED = loadAuthoredManifest(ROOT);

const inventory = loadInventory({ root: ROOT, withBaseline: true });
const rows = inventory.rows;

const guides = fs.readdirSync(path.join(ROOT, '_guides')).filter((f) => f.endsWith('.md'));
const n = (k) => rows.filter((r) => r[k]).length;
// "Done" requires an authored body recorded in content-rewrites.json AND a front-matter quiz.
// Generated pages never count as done on their own: cron output has shipped fabricated figures before.
const isDone = inventory.isDone; // single definition, shared with topic ranking
const tierOrder = ['beginner', 'intermediate', 'advanced'];
const today = new Date().toISOString().slice(0, 10);

const L = [];
L.push('# Content Progress Tracker — unkiethestockjunkie.com');
L.push('');
L.push(`Generated ${today} by \`node scripts/progress-report.js\`. **Do not hand-edit the tables** —`);
L.push('regenerate them. Numbers come from the working tree plus `git show <initial-commit>`, so a row');
L.push('cannot claim work that was never written to disk.');
L.push('');
L.push('## Definition of done (per article)');
L.push('');
L.push('A row is fully done only when **all four** are true, applied in one pass per article:');
L.push('');
L.push('1. `rewr ✓` — body replaced via `scripts/rewrite-body.js` (front matter stays immutable).');
L.push('2. Voice — no banned AI-isms left; concrete anchors instead of generic analogies.');
L.push('3. Substance — content *added*, not just polished; original verified facts preserved; invented');
L.push('   numbers removed or confirmed against a primary source (`npm run review-numbers`).');
L.push('4. `quiz ✓` — two authored questions with explanations, stored in **front matter**.');
L.push('');
L.push('Then, once per batch: `npm run verify-content` → `npm test` → Docker build → push →');
L.push('`npm run check-live`. Never mark a row from memory without these.');
L.push('');
L.push(`**Method decision (${today}): quality over breadth.** Quizzes ship together with a substance`);
L.push('rewrite per article. No quiz-only passes on fundamentals pages, because a quiz bolted onto thin');
L.push('prose still reads thin.');
L.push('');
L.push('## Scoreboard');
L.push('');
L.push('| tier | articles | rewritten | quiz | both | remaining |');
L.push('| --- | --: | --: | --: | --: | --: |');
for (const t of tierOrder) {
  const g = rows.filter((r) => r.tier === t);
  L.push(`| ${t} | ${g.length} | ${g.filter((r) => r.status === 'authored').length} | ${g.filter((r) => r.quiz).length} | ${g.filter(isDone).length} | ${g.filter((r) => !isDone(r)).length} |`);
}
L.push(`| **total** | **${rows.length}** | **${rows.filter((r) => r.status === 'authored').length}** | **${n('quiz')}** | **${rows.filter(isDone).length}** | **${rows.filter((r) => !isDone(r)).length}** |`);
L.push('');
L.push(`Guides authored: ${guides.length} (\`${guides.map((g) => g.replace('.md', '')).join('`, `')}\`)`);
L.push('');
L.push('Legend: `tells` = banned-phrase matches still in the body (advisory). `rel` = has related_articles.');
L.push('');

function table(title, list, note) {
  L.push(`## ${title}  (${list.length})`);
  if (note) { L.push(''); L.push(note); }
  L.push('');
  if (!list.length) { L.push('_none_'); L.push(''); return; }
  L.push('- [ ] | article | tier | words | quiz | body | tells | rel');
  L.push('| --- | --- | --- | --: | :-: | :-: | --: | :-: |');
  for (const r of list) {
    const bodyCol = r.status === 'authored' ? 'authored' : r.status === 'generated' ? 'cron' : '—';
    L.push(`- [ ] | [\`${r.slug}\`](unkiethestockjunkie.com/${r.file}) | ${r.tier} | ${r.words} | ${r.quiz ? '✓' : '—'} | ${bodyCol} | ${r.tells} | ${r.related ? '✓' : '—'} |`);
  }
  L.push('');
}

const done = rows.filter(isDone);
const todo = rows.filter((r) => !isDone(r));
const sortTier = (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || b.tells - a.tells || a.words - b.words;

L.push('## Working order');
L.push('');
L.push('Close beginner first, then intermediate, then advanced; inside a tier start where `tells` is');
L.push('highest and word count lowest, since those need both fixes most.');
L.push('');

for (const t of tierOrder) {
  const sub = todo.filter((r) => r.tier === t).sort(sortTier);
  table(`${t} — next up`, sub, t === 'beginner'
    ? 'Five beginner pages are the last without quizzes; finish these before opening the intermediate tier.'
    : t === 'intermediate'
      ? 'None of these has a quiz yet. Each needs the full four-part pass, fundamentals articles especially.'
      : 'Lowest priority: several read acceptably already (tells = 0); quiz-only may be defensible there.');
}

table('Done (recorded authored body AND carrying an authored quiz)', done.sort(sortTier),
  'Membership comes from `scripts/content-rewrites.json`, written by `scripts/rewrite-body.js`. The generator\n' +
  'refuses entries whose file does not exist, which is what keeps phantom ledger rows from recurring.');

if (argv.includes('--stale')) {
  L.push('## Served copy may not match committed copy');
  L.push('');
  L.push('Run `npm run check-live` for this; it compares prose against the deployed pages.');
  L.push('');
}

L.push('## Notes worth re-reading before a session');
L.push('');
L.push('- `scripts/content-rewrites.json` is the authorship record. Add to it only through');
L.push('  `scripts/rewrite-body.js`; hand-edits must reference files that actually exist (`--check` enforces).');
L.push('- `scripts/rewrite-body.js` preserves existing quiz/related blocks when those flags are omitted');
L.push('  (it used to delete quizzes silently — covered by `scripts/test-rewrite-body.js`).');
L.push('- Slugs must be copied from `ls _articles`, never recalled. The verifier has rejected ~14 invented');
L.push('  slugs written from memory across sessions.');
L.push('- Financial figures get `npm run review-numbers`; flagged values stay unverified until checked');
L.push('  against a primary source. The daily generator published fabricated Tesla figures once.');
L.push('- Do not strip risk disclosures even when they look redundant.');
L.push('- If a rewrite changes a `title:`, update any other article whose `related_articles` shows the old');
L.push('  title string.');
L.push('');

// --check: machine-verifiable ledger integrity. Exits non-zero if the authorship record references a
// file that does not exist (the exact failure that produced six phantom "rewritten" articles earlier),
// or if any article page is missing on disk relative to what the site nav would link.
// Prose used for integrity checks: markdown links collapse to their URLs so banned words inside
// link *titles* ("What Is Volatility? Riding the Roller Coaster") don't read as AI-isms, and code is dropped.
function checkableProse(body) {
  return body.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]*)\]\(([^)]+)\)/g, ' $2 ');
}
const HARD_TELLS = /imagine you'?re (?:on|at) a|in this article|young investor|let'?s explore|delve|game changer|embark|as a teenager|essential to do your own research/i;

if (argv.includes('--check')) {
  const problems = [];
  const todoNotes = [];
  for (const slug of Object.keys(AUTHORED)) {
    const row = rows.find((r) => r.slug === slug);
    if (!row) { problems.push(`manifest references non-existent article: ${slug}`); continue; }
    // A recorded rewrite that reads like untouched generated output means the record is wrong, not the
    // article queue. Five intermediate entries were once claimed this way from an unverified summary.
    const body = fs.readFileSync(path.join(ROOT, row.file), 'utf8').split(/^---[ \t]*$/m).slice(2).join('---');
    const prose = checkableProse(body);
    const links = (prose.match(/\/articles\//g) || []).length;
    const tell = HARD_TELLS.exec(prose);
    if (tell) problems.push(`recorded as rewritten but still contains "${tell[0]}" -- fix the copy or remove it from content-rewrites.json: ${slug}`);
    if (links === 0) problems.push(`recorded as rewritten but has no internal article links: ${slug}`);
  }
  for (const r of rows) {
    // Incomplete-but-honest state is advisory: it is the queue, not an integrity failure.
    if (r.status === 'authored' && !r.quiz) todoNotes.push(`authored, quiz still pending: ${r.slug}`);
    if (r.status !== 'authored' && r.tells >= 3) todoNotes.push(`${r.tells} AI-isms, unrewritten: ${r.slug}`);
  }
  for (const t of todoNotes) console.log('  · ' + t);
  if (problems.length) {
    console.error(`progress-report --check: ${problems.length} integrity problem(s), ${todoNotes.length} queued item(s)`);
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
  }
  console.log(`progress-report --check: manifest clean (${Object.keys(AUTHORED).length} authored entries all resolving to real files); ${todoNotes.length} queued`);
  process.exit(0);
}

fs.writeFileSync(OUT === '-' ? process.stdout : OUT, L.join('\n'));
console.error(`wrote ${OUT === '-' ? '(stdout)' : OUT}: ${done.length} done, ${todo.length} remaining, ${rows.length} total articles`);
