---
layout: default
title: "All Articles - Investing Education for Teens"
description: "Browse all investing articles. Filter by difficulty level to find content perfect for your learning journey."
permalink: /articles/
---

<section class="page-header">
  <div class="container">
    <h1>📚 All Articles</h1>
    <p class="lead">Investing explained in plain language, one verified idea at a time.</p>
  </div>
</section>

<section class="articles-content">
  <div class="container">

    <div class="articles-toolbar">
      <div class="search-row">
        <label class="search-label" for="article-search">Search articles</label>
        <div class="search-box">
          <span class="search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            id="article-search"
            class="search-input"
            placeholder="Try &quot;dividends&quot;, &quot;Buffett&quot;, or &quot;ETF&quot;"
            autocomplete="off"
            aria-describedby="results-count"
          />
          <button type="button" class="search-clear" id="article-search-clear" hidden aria-label="Clear search">✕</button>
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-buttons">
          <button class="filter-btn active" data-filter="all" onclick="filterArticles('all')">All Articles</button>
          <button class="filter-btn" data-filter="beginner" onclick="filterArticles('beginner')">Beginner</button>
          <button class="filter-btn" data-filter="intermediate" onclick="filterArticles('intermediate')">Intermediate</button>
          <button class="filter-btn" data-filter="advanced" onclick="filterArticles('advanced')">Advanced</button>
        </div>
        <div class="toolbar-meta">
          <span id="results-count" class="results-count">Showing all articles</span>
          <span class="daily-badge">🔍 Checked against sources before publishing</span>
        </div>
      </div>
    </div>

    <div class="articles-list" id="articles-list">
      {% for article in site.articles reversed %}
        {% include article-card.html article=article %}
      {% else %}
        <div class="no-articles">
          <h3>No articles yet</h3>
          <p>Articles are generated automatically each day. Check back soon!</p>
        </div>
      {% endfor %}
    </div>

    <div class="no-results" id="no-results" role="status" hidden>
      <h3>No matches</h3>
      <p id="no-results-text">Nothing matched that search.</p>
      <button type="button" class="btn btn-secondary" id="no-results-reset">Show all articles</button>
    </div>

  </div>
</section>

<section class="cta-section">
  <div class="container">
    <div class="cta-box">
      <h2>Want to Learn Faster?</h2>
      <p>Try our interactive screeners to practice finding stocks like legendary investors.</p>
      <a href="/screeners" class="btn btn-primary btn-large">Try Screeners</a>
    </div>
  </div>
</section>

<style>
.page-header {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  padding: var(--spacing-2xl) 0;
  text-align: center;
}

.page-header h1 {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lead {
  font-size: 1.25rem;
  color: var(--text-secondary);
}

.articles-content {
  padding: var(--spacing-2xl) 0;
}

/* Horizontal filter toolbar */
.articles-toolbar {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.filter-buttons {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.5rem 1.25rem;
  border: 2px solid var(--border-color);
  border-radius: 9999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.filter-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.filter-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-on-primary);
}

.filter-btn.active:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

.results-count {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.daily-badge {
  font-size: 0.8125rem;
  color: #78350f;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  font-weight: 500;
  white-space: nowrap;
}

/* 4-column article grid on desktop */
.articles-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--spacing-lg);
}

.no-articles {
  grid-column: 1 / -1;
  text-align: center;
  padding: var(--spacing-3xl);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
}

.no-articles h3 {
  margin-bottom: var(--spacing-md);
  color: var(--text-secondary);
}

.no-articles p {
  color: var(--text-muted);
}

.cta-section {
  padding: var(--spacing-3xl) 0;
  background: var(--bg-secondary);
}

.cta-box {
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}

.cta-box h2 {
  margin-bottom: var(--spacing-sm);
}

.cta-box p {
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xl);
}

@media (max-width: 768px) {
  .page-header h1 {
    font-size: 2rem;
  }

  .toolbar-meta {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .page-header {
    padding: var(--spacing-xl) 0;
  }

  .page-header h1 {
    font-size: 1.75rem;
  }

  .articles-content {
    padding: var(--spacing-xl) 0;
  }

  .articles-list {
    grid-template-columns: 1fr;
  }

  .filter-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }

  .filter-btn {
    border-radius: var(--border-radius);
    text-align: center;
  }

  .daily-badge {
    display: none;
  }
}

/* Search */
.search-row {
  margin-bottom: var(--spacing-lg);
}

.search-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 32rem;
}

.search-icon {
  position: absolute;
  left: var(--spacing-md);
  font-size: 1rem;
  pointer-events: none;
  opacity: 0.7;
}

.search-input {
  width: 100%;
  padding: 0.75rem 2.75rem 0.75rem 2.75rem;
  font-family: inherit;
  font-size: 1rem;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

/* Native clear button in WebKit/Safari conflicts with our own control. */
.search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.search-clear {
  position: absolute;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 1rem;
  color: var(--text-muted);
  background: none;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
}

.search-clear:hover {
  color: var(--text-primary);
}

.no-results {
  text-align: center;
  padding: var(--spacing-3xl) var(--spacing-md);
  color: var(--text-secondary);
}

.no-results h3 {
  margin-bottom: var(--spacing-sm);
}

.no-results p {
  margin-bottom: var(--spacing-lg);
}
</style>

<script>
/**
 * Article filtering by difficulty + free-text search.
 *
 * Both filters run through applyArticleFilters() so they compose instead of fighting:
 * separate handlers each calling style.display would let one undo the other.
 *
 * Searches the text already present in each card (title, description, tags) rather than
 * fetching an index. The /articles page is ~128KB and already contains every field we
 * want to match, so a search.json would re-download roughly 24KB of duplicated data and
 * add a request that can fail. This also keeps GitHub Pages support trivial - no build
 * step, no service, no query endpoint.
 */
(function () {
  var list = document.getElementById('articles-list');
  if (!list) return;

  var cards = Array.prototype.slice.call(list.querySelectorAll('.article-card'));
  var resultsCount = document.getElementById('results-count');
  var searchInput = document.getElementById('article-search');
  var clearBtn = document.getElementById('article-search-clear');
  var noResults = document.getElementById('no-results');
  var noResultsText = document.getElementById('no-results-text');
  var resetBtn = document.getElementById('no-results-reset');

  // Pre-index each card's searchable text once at load instead of walking the DOM per keystroke.
  var records = cards.map(function (card) {
    var title = card.querySelector('.article-card-title');
    var desc = card.querySelector('.article-card-description');
    // Tags are read from data-tags, not the rendered .tag pills: article-card.html shows
    // only the first three for layout reasons, which would have left ~23% of all tags
    // unfindable - including hyphenated ones like compound-interest.
    return {
      card: card,
      haystack: [
        title ? title.textContent : '',
        desc ? desc.textContent : '',
        card.getAttribute('data-tags') || '',
        card.getAttribute('data-difficulty') || ''
      ].join(' ').toLowerCase()
    };
  });

  var currentFilter = 'all';
  var currentQuery = '';

  function labelFor(filter) {
    return filter.charAt(0).toUpperCase() + filter.slice(1);
  }

  function apply() {
    var terms = currentQuery.split(/\s+/).filter(Boolean);
    var visible = 0;

    records.forEach(function (rec) {
      var matchesDifficulty =
        currentFilter === 'all' || rec.card.getAttribute('data-difficulty') === currentFilter;
      // All terms must appear (AND), so "dividend safety" narrows rather than widens.
      var matchesQuery = terms.every(function (term) {
        return rec.haystack.indexOf(term) !== -1;
      });

      var show = matchesDifficulty && matchesQuery;
      rec.card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (resultsCount) {
      if (terms.length || currentFilter !== 'all') {
        var bits = [visible];
        bits.push(currentFilter === 'all' ? 'articles' : labelFor(currentFilter) + ' articles');
        if (terms.length) bits.push('matching "' + currentQuery + '"');
        resultsCount.textContent = 'Showing ' + bits.join(' ');
      } else {
        resultsCount.textContent = 'Showing all ' + visible + ' articles';
      }
    }

    if (noResults) {
      noResults.hidden = visible !== 0;
      if (visible === 0 && noResultsText) {
        noResultsText.textContent = terms.length
          ? 'Nothing matched "' + currentQuery + '"'
          + (currentFilter === 'all' ? '.' : ' at the ' + labelFor(currentFilter) + ' level.')
          : 'There are no ' + labelFor(currentFilter) + ' articles yet.';
      }
    }

    if (clearBtn) clearBtn.hidden = !currentQuery;
  }

  // Exposed for the existing difficulty buttons in the toolbar.
  window.filterArticles = function (filter) {
    currentFilter = filter || 'all';
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });
    apply();
  };

  if (searchInput) {
    var timer;
    searchInput.addEventListener('input', function (e) {
      clearTimeout(timer);
      var value = e.target.value;
      // Debounced: filtering 101 cards per keystroke is wasteful on low-end phones,
      // which is much of this audience.
      timer = setTimeout(function () {
        currentQuery = value.trim().toLowerCase();
        apply();
      }, 150);
    });

    // Escape clears, matching what people expect from a search field.
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        searchInput.value = '';
        currentQuery = '';
        apply();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      currentQuery = '';
      apply();
      if (searchInput) searchInput.focus();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      currentQuery = '';
      window.filterArticles('all');
    });
  }

  apply();
})();
</script>
