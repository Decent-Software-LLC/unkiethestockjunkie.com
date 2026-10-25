'use strict';
/**
 * Record what the site was built FROM, so "is this _site current?" becomes a content question
 * rather than a timestamp question.
 *
 * Timestamps turned out to be unusable here. The test suite legitimately round-trips one real article through
 * scripts/rewrite-body.js and restores it byte-for-byte, which bumps that file's mtime past the build without
 * changing a single character. Judged by mtime that looks like unbuilt content, so an mtime rule either cries
 * wolf on every run or has to be loosened until it catches nothing. Content hashes report stale only when the
 * rendered HTML really cannot reflect the files on disk.
 *
 * Written by `npm run build` and by CI immediately after `jekyll build`, because Jekyll itself has no idea
 * which sources it was fed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { inputFiles, MANIFEST_REL } = require('./lib/site-freshness');

function main() {
  const root = process.cwd();
  const files = {};
  for (const rel of inputFiles(root)) {
    try {
      files[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
    } catch (e) { /* vanished mid-run: omitting it makes the next check report it as deleted */ }
  }
  const dest = path.join(root, '_site', MANIFEST_REL);
  if (!fs.existsSync(path.dirname(dest))) {
    console.error('_site does not exist yet -- build first, then mark' );
    process.exit(1);
  }
  fs.writeFileSync(dest, JSON.stringify({ generatedAt: new Date().toISOString(), count: Object.keys(files).length, files }, null, 0));
  console.log(`marked _site as built from ${Object.keys(files).length} content files`);
}

if (require.main === module) main();
