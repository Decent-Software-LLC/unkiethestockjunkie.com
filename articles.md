---
layout: default
title: "All Articles - Investing Education for Teens"
description: "Browse all investing articles. Filter by difficulty level to find content perfect for your learning journey."
permalink: /articles/
---

<section class="page-header">
  <div class="container">
    <h1>📚 All Articles</h1>
    <p class="lead">Daily investing education for smart teens. New articles every day!</p>
  </div>
</section>

<section class="articles-content">
  <div class="container">

    <div class="articles-toolbar">
      <div class="filter-row">
        <div class="filter-buttons">
          <button class="filter-btn active" data-filter="all" onclick="filterArticles('all')">All Articles</button>
          <button class="filter-btn" data-filter="beginner" onclick="filterArticles('beginner')">Beginner</button>
          <button class="filter-btn" data-filter="intermediate" onclick="filterArticles('intermediate')">Intermediate</button>
          <button class="filter-btn" data-filter="advanced" onclick="filterArticles('advanced')">Advanced</button>
        </div>
        <div class="toolbar-meta">
          <span id="results-count" class="results-count">Showing all articles</span>
          <span class="daily-badge">🔄 New article every day</span>
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
</style>

<script>
function filterArticles(filter) {
  const resultsCount = document.getElementById('results-count');
  const buttons = document.querySelectorAll('.filter-btn');
  const articles = document.querySelectorAll('.article-card');

  buttons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
    }
  });

  let visibleCount = 0;
  articles.forEach(article => {
    const articleDifficulty = article.dataset.difficulty;
    if (filter === 'all' || articleDifficulty === filter) {
      article.style.display = '';
      visibleCount++;
    } else {
      article.style.display = 'none';
    }
  });

  if (filter === 'all') {
    resultsCount.textContent = `Showing all ${visibleCount} articles`;
  } else {
    const filterLabel = filter.charAt(0).toUpperCase() + filter.slice(1);
    resultsCount.textContent = `Showing ${visibleCount} ${filterLabel} articles`;
  }
}
</script>
