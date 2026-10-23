#!/usr/bin/env node
/**
 * Tests for assets/js/share.js against the generated article markup.
 *
 * Runs in jsdom installed transiently by this script (npm --no-save) rather than as a
 * declared dependency: the site ships three runtime deps and must not grow for a test
 * tool. If jsdom is unavailable the suite skips rather than fails - CI covers behaviour
 * through build + structural assertions instead of blocking on a dev-only package.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, '_site', 'articles', 'what-is-a-stock-a-teen-s-first-guide', 'index.html');
const SHARE_JS = path.join(ROOT, 'assets', 'js', 'share.js');

function loadJsdom() {
  try {
    return require(require.resolve('jsdom', { paths: [ROOT, __dirname] }));
  } catch (e) {
    return null;
  }
}

if (!fs.existsSync(PAGE)) {
  console.error('\n❌ Missing _site output. Run `npm run build` first.\n');
  process.exit(2);
}

let jsdom = loadJsdom();
if (!jsdom) {
  try {
    execSync('npm install --no-save --no-audit --no-fund jsdom', { cwd: ROOT, stdio: 'ignore', timeout: 180000 });
    jsdom = loadJsdom();
  } catch (e) {
    /* fall through to skip */
  }
}

if (!jsdom) {
  console.log('\nshare.js\n  – skipped (jsdom unavailable offline; behaviour covered structurally)\n');
  process.exit(0);
}

const { JSDOM } = jsdom;
const html = fs.readFileSync(PAGE, 'utf8');
const shareScript = fs.readFileSync(SHARE_JS, 'utf8');

let passed = 0;
let failed = 0;

/** Build a page with the given browser capabilities, returning the document + hooks. */
function makeDom({ canShare = true, clipboard = 'grant', shareImpl } = {}) {
  // runScripts: 'outside-only' is required for window.eval() to execute in the page
  // realm; without it, globals like `document` are not visible inside eval'd code.
  const dom = new JSDOM(html, {
    url: 'https://unkiethestockjunkie.com/articles/what-is-a-stock-a-teen-s-first-guide/',
    runScripts: 'outside-only'
  });
  const { window } = dom;

  const copied = [];
  const shared = [];

  Object.defineProperty(window.navigator, 'clipboard', {
    value:
      clipboard === 'none'
        ? undefined
        : {
            writeText: (t) =>
              clipboard === 'deny' ? Promise.reject(new Error('denied')) : Promise.resolve(copied.push(t)),
          },
    configurable: true
  });

  if (canShare && typeof shareImpl === 'function') {
    window.navigator.share = shareImpl(shared);
  } else if (canShare) {
    window.navigator.share = (payload) => {
      shared.push(payload);
      return Promise.resolve();
    };
  } else {
    delete window.navigator.share;
  }

  // isSecureContext drives which copy path is taken.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

  // Execute the injected script now that navigator/window are patched.
  window.eval(shareScript);
  return { window, doc: window.document, copied, shared };
}

function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\nshare.js\n');

  // --- no deception -------------------------------------------------------
  {
    const { doc } = makeDom();
    const anchors = [...doc.querySelectorAll('.share-btn')].filter((a) => a.tagName === 'A');
    const ok = anchors.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} every share control is a button (no links to platform homepages)`);
    ok ? passed++ : (failed++, console.error('      found anchor-based share buttons'));
  }

  {
    const { doc } = makeDom();
    const src = [...doc.querySelectorAll('.share-btn')].map((b) => b.getAttribute('href')).filter(Boolean);
    const thirdParty = src.filter((h) => /instagram|snapchat|tiktok/.test(h));
    const ok = thirdParty.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} no page URL embedded in a third-party path segment`);
    ok ? passed++ : (failed++, console.error(`      ${thirdParty.join(', ')}`));
  }

  // --- native share -------------------------------------------------------
  {
    const { doc, shared } = makeDom();
    const btn = doc.getElementById('native-share');
    const shown = btn && !btn.hidden;
    console.log(`  ${shown ? '✓' : '✗'} Share button revealed when navigator.share exists`);
    shown ? passed++ : (failed++, console.error('      expected visible'));

    click(btn);
    await tick();
    const payloadOk = shared.length === 1 && !!shared[0].url && !!shared[0].title;
    console.log(`  ${payloadOk ? '✓' : '✗'} share() called with title + url`);
    payloadOk ? passed++ : (failed++, console.error(`      ${JSON.stringify(shared)}`));

    const label = btn.querySelector('span').textContent;
    const confirmed = /Shared/i.test(label);
    console.log(`  ${confirmed ? '✓' : '✗'} button confirms after share (${label})`);
    confirmed ? passed++ : (failed++, console.error('      no confirmation shown'));
  }

  {
    const { doc, shared } = makeDom({
      shareImpl: (sink) => () => {
        sink.push('aborted');
        return Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      }
    });
    const btn = doc.getElementById('native-share');
    click(btn);
    await tick();
    const stayed = !btn.hidden;
    console.log(`  ${stayed ? '✓' : '✗'} dismissing the share sheet keeps the button (not an error)`);
    stayed ? passed++ : (failed++, console.error('      button hid itself after AbortError'));
  }

  {
    const { doc } = makeDom({ canShare: false });
    const btn = doc.getElementById('native-share');
    const hidden = btn.hidden;
    console.log(`  ${hidden ? '✓' : '✗'} Share button stays hidden without navigator.share`);
    hidden ? passed++ : (failed++, console.error('      showed a button that cannot work'));
  }

  // --- copy link ----------------------------------------------------------
  {
    const { doc, copied } = makeDom();
    const btn = doc.querySelector('[data-copy-role="link"]');
    click(btn);
    await tick();
    const gotUrl = copied.length === 1 && /^https:\/\/unkiethestockjunkie\.com\/articles\//.test(copied[0]);
    console.log(`  ${gotUrl ? '✓' : '✗'} Copy Link writes the absolute article URL`);
    gotUrl ? passed++ : (failed++, console.error(`      ${JSON.stringify(copied)}`));
  }

  {
    const { doc, copied } = makeDom();
    const btn = doc.querySelector('[data-copy-role="text"]');
    click(btn);
    await tick();
    const text = copied[0] || '';
    const hasTitleAndUrl = /What is a Stock/.test(text) && /unkiethestockjunkie\.com/.test(text);
    console.log(`  ${hasTitleAndUrl ? '✓' : '✗'} Copy Title + Link includes both`);
    hasTitleAndUrl ? passed++ : (failed++, console.error(`      ${JSON.stringify(text)}`));
  }

  {
    const { doc } = makeDom();
    const btn = doc.querySelector('[data-copy-role="link"]');
    click(btn);
    await tick();
    const saidCopied = /Copied/i.test(btn.querySelector('span').textContent);
    console.log(`  ${saidCopied ? '✓' : '✗'} copy shows "Copied!" feedback`);
    saidCopied ? passed++ : (failed++, console.error('      no feedback'));
  }

  {
    // Plain HTTP: navigator.clipboard is undefined there. The previous implementation
    // called .then() on it directly, which throws (synchronously inside the handler)
    // or rejects unhandled. Both count as failure - asserting only on unhandledRejection
    // missed the synchronous throw, because jsdom traps listener exceptions.
    const { doc } = makeDom({ clipboard: 'none' });
    let unhandled = null;
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (r) => (unhandled = r));

    const btn = doc.querySelector('[data-copy-role="link"]');
    let threw = null;
    try {
      click(btn);
    } catch (err) {
      threw = err;
    }
    await tick();

    const survived = unhandled === null && threw === null;
    console.log(`  ${survived ? '✓' : '✗'} missing Clipboard API degrades instead of throwing`);
    survived ? passed++ : (failed++, console.error(`      ${threw || unhandled}`));

    // And it must still do something useful: either copy via fallback or guide the user.
    const label = btn.querySelector('span').textContent;
    const acted = /Copied|⌘|Ctrl/.test(label);
    console.log(`  ${acted ? '✓' : '✗'} copy still acts without the Clipboard API (${label})`);
    acted ? passed++ : (failed++, console.error('      silently did nothing'));

    process.removeAllListeners('unhandledRejection');
  }

  {
    const { doc } = makeDom({ clipboard: 'deny' });
    const btn = doc.querySelector('[data-copy-role="link"]');
    click(btn);
    await tick();
    const label = btn.querySelector('span').textContent;
    // Falls back to the textarea path; either way the user gets guidance, never silence.
    const guided = /Copied|⌘|Ctrl/.test(label);
    console.log(`  ${guided ? '✓' : '✗'} denied permission still guides the user (${label})`);
    guided ? passed++ : (failed++, console.error('      silent failure'));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
