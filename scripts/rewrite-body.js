#!/usr/bin/env node
// Rewrite an article's BODY while guaranteeing its front matter survives byte-for-byte.
//
// Why: while hand-editing articles I twice invented image filenames and once invented a whole
// filename+date, creating a duplicate article file with a fabricated timestamp. Every one of those
// came from retyping front matter I had no need to retype. This takes the committed front matter
// as immutable input and accepts only new prose plus an explicit quiz/related block.
//
// Usage:  node scripts/rewrite-body.js <article-path> --body <file.md> [--quiz <yaml>] [--related <yaml>]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function committedFrontMatter(rel) {
  // Read the WORKING TREE first. Reading only HEAD meant that iterating on an article within one
  // session -- adding a quiz, fixing a link -- had the next rewrite reconstruct front matter from the
  // stale commit and quietly revert those edits. Front matter stays immutable because this tool has no
  // flags for overriding identity fields, not because it must come from git.
  let text;
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    text = fs.readFileSync(abs, 'utf8');
  } else {
    try {
      text = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      throw new Error(`not on disk or in HEAD, so front matter cannot be read: ${rel}`);
    }
  }
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) throw new Error(`no front-matter fence in ${rel}`);
  return { raw: m[0], fields: m[1] };
}

// Keys we trust from the commit. Anything the author adds must be explicitly requested.
// Block-valued keys handled separately below; every other committed key is copied verbatim.
// This used to be an allowlist (layout/title/description/date/difficulty/tags/image/image_credit/
// image_credit_url), which silently deleted any key not listed -- `image_height` disappeared from
// every article that was rewritten while carrying one. Nothing re-supplies title or description, so
// those must stay here too; a rewrite changes prose, never identity.
const DROPPED = ['quiz', 'related_articles'];

function keptLines(fields) {
  const out = [];
  let dropping = false;
  for (const line of fields.split('\n')) {
    // Only the two keys we re-supply are treated as blocks to drop. This used to be a pattern -- any "key:" with an
    // empty value started a skip region -- which meant guides lost their entire `steps:` block whenever this tool
    // touched them, since steps is exactly such a key. Explicit over inferred: the corpus sweep found three guides
    // whose structured front matter would have been destroyed.
    const key = /^([a-z_]+):[ \t]*$/.exec(line);
    if (key && DROPPED.includes(key[1])) { dropping = true; continue; }
    if (dropping) {
      if (/^\s/.test(line)) continue;    // still inside the dropped block's indentation
      dropping = false;                    // next top-level key: normal handling resumes below
    }
    // Column-0 sequence debris: a list row with no key above it. Legitimate sequences in this corpus are always
    // indented beneath their key, so anything at column 0 is leftover from a write that lost its `quiz:` key --
    // copied verbatim before, which produced pages carrying two quizzes in YAML Jekyll refused to load.
    if (/^-\s/.test(line)) { dropping = true; continue; }
    const k = /^([a-z_]+):/.exec(line);
    if (k && DROPPED.includes(k[1])) continue;
    out.push(line);
  }
  return out.filter((l) => l.trim() !== '');
}

/**
 * Split a document into front-matter fields and body using ONE definition of the fence.
 * Previously "what counts as front matter" was re-derived separately by the writer, the validators and the
 * progress tracker, which is how files passed local checks while Jekyll loaded none of their quiz.
 */
function splitDocument(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n[\s\S]*)?$/.exec(text);
  if (!m) throw new Error('no front-matter fence');
  return { raw: m[0], fields: m[1], body: (m[2] || '').replace(/^\r?\n/, '') };
}

/** Pure assembly: front-matter fields in, finished document out. No filesystem access, so the whole corpus can be checked without touching it. */
function assembleDocument(fmFields, bodyText, extraBlocks = {}) {
  const header = keptLines(fmFields);
  const blocks = [];
  for (const key of ['quiz', 'related_articles']) {
    if (!extraBlocks[key]) continue;
    const text = extraBlocks[key].trim();
    // Callers must hand over a complete block including its key. A bare list used to be pasted in as-is, which
    // produced front matter with no `quiz:` key at all: local validators still found the questions (their parsers
    // are forgiving about shape) while Jekyll dropped the quiz entirely, so the page shipped looking fine with no
    // quiz on it. Fail loudly at the boundary instead.
    if (!text.startsWith(`${key}:`)) {
      throw new Error(`${key} block must begin with "${key}:" -- got "${text.split('\n')[0].slice(0, 40)}"`);
    }
    blocks.push(text);
  }
  if (!blocks.some((b) => b.startsWith('related_articles:'))) {
    // Same protection as quiz: never drop committed related links because a caller forgot the flag.
    const m = /^(related_articles:[\s\S]*?)(?=^[a-z_]+:|(?![\s\S]))/m.exec(fmFields);
    if (m) blocks.push(m[1].trim());
  }
  if (!blocks.some((b) => b.startsWith('quiz:'))) {
    // Same protection as related_articles: a voice rewrite that supplies no new quiz must
    // keep the authored one. Without this, `--body` alone silently deleted every quiz on
    // the page it touched, which is exactly how several articles lost their quizzes.
    const m = /^(quiz:[\s\S]*?)(?=^[a-z_]+:|(?![\s\S]))/m.exec(fmFields);
    if (m) blocks.push(m[1].trim());
  }
  // Keep reused blocks in their committed relative order. Always emitting quiz-then-related made an
  // unchanged rewrite reshuffle front matter, producing noisy diffs on pages nobody was editing.
  const orderOf = (key) => {
    const i = fmFields.search(new RegExp('^' + key + ':[ \\t]*$', 'm'));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  blocks.sort((a, b) => {
    const ka = a.startsWith('quiz:') ? 'quiz' : 'related_articles';
    const kb = b.startsWith('quiz:') ? 'quiz' : 'related_articles';
    return orderOf(ka) - orderOf(kb);
  });
  // Exactly one blank line between the closing fence and the prose. Some committed files had none and one had two,
  // which made re-supplying a file its own body produce a diff at the junction -- so every edit of a finished
  // article looked like a content change. Emitting a fixed separator makes the round trip byte-exact and lets the
  // test suite assert that invariant over the whole corpus instead of over whichever fixture sorted first.
  return '---\n' + header.concat(blocks).join('\n') + '\n---\n\n' + bodyText.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
}

module.exports = function rewriteBody(rel, bodyText, extraBlocks = {}) {
  const fm = committedFrontMatter(rel);
  const doc = assembleDocument(fm.fields, bodyText, extraBlocks);
  const abs = path.join(ROOT, rel);
  fs.writeFileSync(abs, doc);
  return doc;
};

// Progress tracking must never depend on remembering which articles were touched. git-diffing against
// the initial commit proved useless for this: one bulk scaffolding-clean pass made every body differ,
// so "changed since baseline" could not distinguish a real editorial pass from cosmetic cleanup.
const MANIFEST = path.join(__dirname, 'content-rewrites.json');
function recordRewrite(rel) {
  const slug = path.basename(rel).replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '');
  let data = { slugs: {} };
  try { data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { /* first entry */ }
  if (!data.slugs) data.slugs = {};
  data.slugs[slug] = Object.assign({ at: new Date().toISOString().slice(0, 10) }, data.slugs[slug] || {});
  data.slugs[slug].at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(MANIFEST, JSON.stringify(data, null, 1) + '\n');
}

module.exports.splitDocument = splitDocument;
module.exports.assembleDocument = assembleDocument;

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const rel = argv[0];
  const bodyFile = flag('--body');
  if (!rel || !bodyFile) {
    console.error('usage: node scripts/rewrite-body.js <_articles/file.md> --body <prose.md> [--quiz <yamlfile>] [--related <yamlfile>]');
    process.exit(2);
  }
  // Article path is repo-relative; --body/--quiz/--related are read as given so they can live
  // in /tmp (they are scratch drafts, not project files).
  const readOrNull = (f) => (f ? fs.readFileSync(f, 'utf8') : null);
  const doc = module.exports(rel, fs.readFileSync(bodyFile, 'utf8'), {
    quiz: readOrNull(flag('--quiz')),
    related_articles: readOrNull(flag('--related'))
  });
  recordRewrite(rel);   // record only on an explicit CLI run; calling the exported function from tests
                        // must not write itself into the authorship ledger (it did, marking a fixture authored)
  console.log(`rewrote ${rel} (${doc.trim().split(/\s+/).length} words incl. front matter)`);
}
