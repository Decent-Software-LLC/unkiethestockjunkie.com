---
layout: default
title: "Investment Guides"
description: "Step-by-step walkthroughs for US teens: opening a custodial account, placing your first trade, and building a starter portfolio."
permalink: /guides/
---

<section class="page-header">
  <div class="container">
    <h1>Guides</h1>
    <p class="lead">Walkthroughs with actual steps &mdash; what to click, what to ask, what it costs.</p>
  </div>
</section>

<section class="guides-list-section">
  <div class="container">
    {%- assign sorted = site.guides | sort: 'time' -%}
    {%- if sorted.size == 0 -%}
      <p class="guides-empty">No guides published yet. The <a href="{{ '/articles' | relative_url }}">articles</a> cover the same ground in shorter form.</p>
    {%- else -%}
      <ul class="guides-grid">
        {%- for g in sorted -%}
          <li class="featured-guide-card">
            <div class="guide-content">
              <div class="guide-meta">
                {%- if g.difficulty -%}
                  <span class="difficulty-badge difficulty-{{ g.difficulty }}">{{ g.difficulty | capitalize }}</span>
                {%- endif -%}
                {%- if g.time -%}<span class="guide-duration">{{ g.time }} min read</span>{%- endif -%}
              </div>
              <h3><a href="{{ g.url | relative_url }}">{{ g.title }}</a></h3>
              <p>{{ g.description }}</p>
              {%- if g.steps.size > 0 -%}
                <ol class="guide-step-preview">
                  {%- for s in g.steps limit: 3 -%}<li>{{ s.title }}</li>{%- endfor -%}
                  {%- if g.steps.size > 3 -%}<li class="more">+ {{ g.steps.size | minus: 3 }} more steps</li>{%- endif -%}
                </ol>
              {%- endif -%}
              <a href="{{ g.url | relative_url }}" class="btn btn-primary">Read guide</a>
            </div>
          </li>
        {%- endfor -%}
      </ul>
    {%- endif -%}
  </div>
</section>

<section class="guide-cta">
  <div class="container">
    <div class="cta-box">
      <h2>Something we haven&rsquo;t covered?</h2>
      <p>Tell us what you&rsquo;d want walked through step by step.</p>
      <a href="{{ '/contact' | relative_url }}" class="btn btn-primary btn-large">Request a guide</a>
    </div>
  </div>
</section>
