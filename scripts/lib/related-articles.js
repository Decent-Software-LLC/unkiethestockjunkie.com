/**
 * Related-article scoring for Unkie The Stock Junkie.
 *
 * Shared by scripts/backfill-related-articles.js (one-off pass over the corpus)
 * and scripts/generate-article.js (so new articles ship with links attached).
 *
 * Deterministic on purpose: this runs unattended from GitHub Actions on a cron,
 * so it must never depend on an LLM call, network access, or ordering that can
 * drift between runs. Same corpus in, same recommendations out.
 */

const fs = require('fs');
const path = require('path');

// This file lives at scripts/lib/, so the corpus is two levels up from here.
// Resolving against __dirname (not cwd) keeps results identical no matter which
// directory a caller invokes the script from.
const ARTICLES_DIR = path.join(__dirname, '..', '..', '_articles');

// A recommendation is only worth showing if it shares real subject matter with
// the host article. One shared tag plus matching difficulty scores 3; a lone
// shared tag scores 2; matching difficulty alone (1) is not enough signal.
const MIN_RELATED_SCORE = 2;
const MAX_RELATED = 3;

/**
 * Parse the leading YAML front matter of a markdown file into plain values.
 * Intentionally minimal — no YAML dependency, just the two forms this repo's
 * generated front matter actually uses: `key: "value"` and `key: ["a", "b"]`.
 *
 * Only column-0 keys are read. This is essential, not cosmetic: related_articles
 * is a list of mappings whose items also have title/url/description keys. Reading
 * those indented lines as top-level keys let the last `    description:` silently
 * overwrite the article's real description, which then propagated into every
 * downstream recommendation (corpus-wide description rotation on re-runs).
 * Anything indented is nested data and must be skipped here; consumers needing
 * the list itself should keep it as raw text or use a real YAML parser.
 */
function parseFrontMatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return null;

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    // Column-0 key only — skips indented children of nested structures.
    const kv = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!kv) continue;

    const [, key, value] = kv;
    if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return data;
}

/** Derive the published URL from an article filename: YYYY-MM-DD-slug.md */
function urlFromFile(filename) {
  const slug = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  return `/articles/${slug}/`;
}

/**
 * Split an article into its raw front-matter text and body, without relying on a
 * lazy match over the whole document.
 *
 * This matters: AI-generated bodies are full of "---" horizontal rules (one file
 * contains 58 of them), so /^(---)([\s\S]*?)(\r?\n---)/ stops at whichever comes
 * first and silently truncates the front matter - and some articles have no blank
 * line after the closing fence, so a naive `$`-anchored terminator rejects them too.
 *
 * Instead: require the file to open with "---", then take the closing fence as the
 * first line that is exactly "---" at column 0 *after* the opening fence.
 *
 * Returns { frontMatter, leading, trailing } where reassembly as
 * `---\n${frontMatter}${trailing}` reproduces the original exactly, or null when
 * the file has no usable front matter.
 */
function splitFrontMatter(raw) {
  const open = /^---[ \t]*\r?\n/.exec(raw);
  if (!open || open.index !== 0) return null;

  const rest = raw.slice(open[0].length);
  // Closing fence must sit at column 0; indented "---" inside a list is not a fence.
  // The tail is optional because pre-existing articles contain "---### Difficulty:"
  // where cleanArticleContent() stripped a leaked heading but left the closing fence
  // glued to it (no newline). Those files would otherwise be skipped as having no
  // front matter, leaving them permanently without related-article links.
  const close = /\r?\n---[ \t]*(?=\r?\n|$|#{1,6}\s)/.exec(rest);
  if (!close) return null;

  return {
    frontMatter: rest.slice(0, close.index),
    leading: open[0],
    trailing: rest.slice(close.index) // includes the closing "---" and everything after
  };
}

/**
 * Read every article's indexable metadata once.
 * Returns [{ file, title, description, difficulty, tags, url }] sorted by file
 * name, so callers get stable output regardless of filesystem enumeration order.
 */
function loadArticleIndex(articlesDir = ARTICLES_DIR) {
  if (!fs.existsSync(articlesDir)) return [];

  return fs
    .readdirSync(articlesDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const fm = parseFrontMatter(fs.readFileSync(path.join(articlesDir, file), 'utf8'));
      if (!fm || !fm.title) return null;
      return {
        file,
        title: fm.title,
        description: fm.description || '',
        difficulty: fm.difficulty || '',
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        url: urlFromFile(file)
      };
    })
    .filter(Boolean);
}

/**
 * Score candidate articles against a host article.
 * Higher is better; candidates at or below MIN_RELATED_SCORE are dropped.
 */
function rankRelated(host, corpus, limit = MAX_RELATED) {
  const hostTags = new Set(host.tags.map((t) => t.toLowerCase()));

  return corpus
    .filter((c) => c.file !== host.file)
    .map((candidate) => {
      const overlap = candidate.tags.filter((t) => hostTags.has(t.toLowerCase())).length;
      const difficultyMatch =
        candidate.difficulty && candidate.difficulty === host.difficulty ? 1 : 0;
      return { candidate, score: overlap * 2 + difficultyMatch };
    })
    .filter((r) => r.score >= MIN_RELATED_SCORE)
    // Best matches first; ties broken by filename so results are reproducible.
    .sort((a, b) => b.score - a.score || a.candidate.file.localeCompare(b.candidate.file))
    .slice(0, limit)
    .map(({ candidate }) => ({
      title: candidate.title,
      url: candidate.url,
      description: candidate.description
    }));
}

/**
 * Render the front-matter block consumed by _layouts/article.html.
 * Returns '' when there is nothing worth linking — the layout already omits
 * the "Continue Learning" section when the key is absent, so emitting an empty
 * list would be worse than emitting nothing.
 */
function toFrontMatter(related) {
  if (!related || related.length < 2) return '';
  const lines = related.map(
    (r) =>
      `  - title: "${String(r.title).replace(/"/g, '\\"')}"\n` +
      `    url: "${r.url}"\n` +
      `    description: "${String(r.description).replace(/"/g, '\\"')}"`
  );
  return `related_articles:\n${lines.join('\n')}\n`;
}

module.exports = {
  ARTICLES_DIR,
  MIN_RELATED_SCORE,
  MAX_RELATED,
  parseFrontMatter,
  splitFrontMatter,
  urlFromFile,
  loadArticleIndex,
  rankRelated,
  toFrontMatter
};
