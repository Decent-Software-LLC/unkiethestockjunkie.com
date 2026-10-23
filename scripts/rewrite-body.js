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
  let text;
  try {
    text = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    throw new Error(`not in HEAD, so front matter cannot be provenance-checked: ${rel}`);
  }
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) throw new Error(`no front-matter fence in committed ${rel}`);
  return { raw: m[0], fields: m[1] };
}

// Keys we trust from the commit. Anything the author adds must be explicitly requested.
const PRESERVE = ['layout', 'title', 'description', 'date', 'difficulty', 'tags', 'image', 'image_credit', 'image_credit_url'];

function keptLines(fields) {
  const out = [];
  let stop = false;
  for (const line of fields.split('\n')) {
    // Stop at the first block-valued key (related_articles:, quiz:) -- those are replaced wholesale.
    if (/^[a-z_]+:\s*$/.test(line)) { stop = true; continue; }
    if (stop) { if (/^\s/.test(line)) continue; stop = false; }
    const k = /^([a-z_]+):/.exec(line);
    if (k && !PRESERVE.includes(k[1])) continue;
    out.push(line);
  }
  return out.filter((l) => l.trim() !== '');
}

module.exports = function rewriteBody(rel, bodyText, extraBlocks = {}) {
  const fm = committedFrontMatter(rel);
  const header = keptLines(fm.fields);
  const blocks = [];
  for (const key of ['quiz', 'related_articles']) {
    if (extraBlocks[key]) blocks.push(extraBlocks[key].trim());
  }
  if (!blocks.some((b) => b.startsWith('related_articles:'))) {
    // Reuse committed related_articles rather than dropping it silently.
    const m = /^(related_articles:[\s\S]*?)(?=^[a-z_]+:|(?![\s\S]))/m.exec(fm.fields);
    if (m) blocks.push(m[1].trim());
  }
  const doc = '---\n' + header.concat(blocks).join('\n') + '\n---\n\n' + bodyText.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  const abs = path.join(ROOT, rel);
  fs.writeFileSync(abs, doc);
  return doc;
};

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
  console.log(`rewrote ${rel} (${doc.trim().split(/\s+/).length} words incl. front matter)`);
}
