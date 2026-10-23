/**
 * Reading progress bar for article pages.
 *
 * Gives a short visual "you're nearly there" cue, which matters for an audience with
 * little patience for a wall of text. Purely presentational:
 *
 *  - Runs only when a .article-content element exists, so it adds nothing on other pages.
 *  - Uses requestAnimationFrame to coalesce scroll events; reading scrollTop per event on
 *    a mid-range Android phone is noticeably janky.
 *  - Marks itself aria-hidden: the percentage is conveyed visually and a live region would
 *    announce constantly for no benefit. Screen-reader users get document structure instead.
 *  - Honours prefers-reduced-motion by staying static rather than animating width.
 */
(function () {
  'use strict';

  var content = document.querySelector('.article-content');
  if (!content) return;

  var bar = document.createElement('div');
  bar.className = 'reading-progress';
  bar.setAttribute('aria-hidden', 'true');

  var fill = document.createElement('div');
  fill.className = 'reading-progress-fill';
  bar.appendChild(fill);
  document.body.appendChild(bar);

  // Width transitions unless the reader has asked for reduced motion.
  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) fill.classList.add('no-transition');

  var ticking = false;

  function update() {
    ticking = false;

    var rect = content.getBoundingClientRect();
    var total = content.offsetHeight;
    // Distance still to read: from the top of the viewport to the end of the article.
    var remaining = rect.top + total - window.innerHeight;
    var scrolled = Math.min(Math.max(-rect.top, 0), total);

    var pct = total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : 0;

    // Only paint when something actually changed.
    var next = pct.toFixed(1) + '%';
    if (fill.style.width !== next) fill.style.width = next;

    bar.hidden = pct <= 0 || remaining < -window.innerHeight;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();
