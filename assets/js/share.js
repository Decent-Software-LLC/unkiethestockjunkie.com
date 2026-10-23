/**
 * Sharing for article pages.
 *
 * Why not per-platform share links: Instagram exposes no web share endpoint (the previous
 * button pointed at instagram.com and shared nothing). Snapchat's /add/<x> is add-a-friend,
 * so passing a page URL placed an encoded URL where a username belongs - and because the URL
 * came from `absolute_url`, any query string would have been embedded in a third-party
 * request, leaking things like an email address in ?utm_email=. TikTok accepts only ?url=,
 * giving a bare link with no title. A teen notices broken buttons immediately; an honest
 * copy/share control does not lie about what it can do.
 *
 * navigator.share hands off to whichever apps the reader actually has installed, which is
 * the only dependable way to reach TikTok/Snapchat/IG Stories from a browser. Where it is
 * unavailable (desktop browsers) the button stays hidden and the copy controls carry the load.
 */
(function () {
  'use strict';

  var container = document.getElementById('share-buttons');
  if (!container) return; // not an article page

  var shareBtn = document.getElementById('native-share');
  var titleEl = document.querySelector('.article-title');
  var descEl = document.querySelector('.article-description');

  var title = titleEl ? titleEl.textContent.trim() : document.title;
  // Absolute URL of this page. location is authoritative here and avoids baking a
  // host header into server-rendered markup.
  var url = window.location.href.split('#')[0];
  var summary = descEl ? descEl.textContent.trim() : '';

  /** Copy with a fallback for contexts without the async Clipboard API. */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        }
      );
    }
    // navigator.clipboard is undefined over plain HTTP and in some in-app browsers;
    // calling .then() on it used to throw an unhandled rejection.
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  /** Flash confirmation inside the button, then restore its label. */
  function confirm(btn, message) {
    var label = btn.querySelector('span');
    if (!label) return;
    var previous = label.textContent;
    label.textContent = message;
    btn.disabled = true;
    setTimeout(function () {
      label.textContent = previous;
      btn.disabled = false;
    }, 1800);
  }

  function fail(btn) {
    var label = btn.querySelector('span');
    if (!label) return;
    var previous = label.textContent;
    label.textContent = 'Press ⌘/Ctrl+C';
    setTimeout(function () {
      label.textContent = previous;
    }, 2500);
  }

  Array.prototype.forEach.call(container.querySelectorAll('[data-copy-role]'), function (btn) {
    btn.addEventListener('click', function () {
      var payload =
        btn.getAttribute('data-copy-role') === 'text'
          ? summary
            ? title + ' — ' + summary + '\n' + url
            : title + ' — ' + url
          : url;

      copy(payload).then(function (ok) {
        if (ok) confirm(btn, 'Copied!');
        else fail(btn);
      });
    });
  });

  if (shareBtn && typeof navigator.share === 'function') {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', function () {
      // The payload must be built inside the click handler: user activation is required,
      // and building it earlier risks the promise being rejected as "NotAllowedError".
      var payload = { title: title, url: url };
      if (summary) payload.text = summary;

      navigator.share(payload).then(
        function () {
          confirm(shareBtn, 'Shared!');
        },
        function (err) {
          // Abort means the reader dismissed the sheet - not a failure worth reporting.
          if (err && err.name === 'AbortError') return;
          // Some Android browsers reject when no handler exists; degrade quietly.
          shareBtn.hidden = true;
        }
      );
    });
  }
})();
