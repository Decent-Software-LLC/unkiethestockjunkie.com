#!/usr/bin/env node
/**
 * Generates new screener pages (munger, greenblatt, oneil) by reusing
 * the exact CSS + JS structure from screeners/lynch.html.
 * Run: node scripts/generate-screener.js
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const lynch = fs.readFileSync(path.join(BASE, 'screeners/lynch.html'), 'utf8');

// Extract the <style>...</style> block from lynch.html (lines from first <style> to </style>)
const styleStart = lynch.indexOf('<style>');
const styleEnd = lynch.indexOf('</style>') + '</style>'.length;
const baseStyle = lynch.slice(styleStart, styleEnd);

// Extract the JS helper functions we keep verbatim (from "function resetResults" to end of </script>)
const jsStart = lynch.indexOf('function resetResults()');
const jsEnd = lynch.indexOf('</script>');
const baseJsTail = lynch.slice(jsStart, jsEnd);

function buildScreener(cfg) {
  const style = baseStyle
    .replaceAll('linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', cfg.gradient)
    .replaceAll('border: 2px solid #f59e0b;', `border: 2px solid ${cfg.color};`)
    .replaceAll('color: #f59e0b;', `color: ${cfg.color};`)
    .replaceAll('.story-badge', `.${cfg.badgeClass}`)
    .replaceAll('.story-badge.strong', `.${cfg.badgeClass}.strong`)
    .replaceAll('.story-badge.moderate', `.${cfg.badgeClass}.moderate`);

  const metricsHtml = cfg.metrics.map(m => `
          <div class="metric-card" data-metric="${m.key}">
            <div class="metric-label">${m.label}</div>
            <div class="metric-value" id="metric-${m.key}">--</div>
            <div class="metric-status" id="status-${m.key}">Loading...</div>
            <div class="metric-target">Target: ${m.target}</div>
          </div>`).join('');

  const criteriaHtml = cfg.criteria.map(c => `
          <div class="criterion">
            <div class="criterion-name">${c.name}</div>
            <div class="criterion-value">${c.value}</div>
            <div class="criterion-desc">${c.desc}</div>
          </div>`).join('');

  const tableRows = cfg.tableRows.map(r => `
          <tr>
            <td><strong>${r.name}</strong><br><span class="company-desc">${r.desc}</span></td>
            <td class="ticker">${r.ticker}</td>
            ${r.cells.map(c => `<td class="metric ${c[1] || ''}">${c[0]}</td>`).join('')}
            <td><span class="${cfg.badgeClass} ${r.badge[1]}">${r.badge[0]}</span></td>
          </tr>`).join('');

  const explanationsHtml = cfg.explanations.map(e => `
      <div class="explanation-card">
        <h3>${e.title}</h3>
        <p>${e.intro}</p>
        <ul>
          ${e.points.map(p => `          <li><strong>${p[0]}:</strong> ${p[1]}</li>`).join('\n')}
        </ul>
      </div>`).join('');

  const jsMetrics = cfg.metrics.map(m => `    ${m.key}: { value: metrics.${m.key}, threshold: ${m.threshold}, pass: ${m.passExpr} }`).join(',\n');

  const jsUpdate = cfg.metrics.map(m => `  updateMetric('${m.key}', ${m.format}, evaluations.${m.key}.pass);`).join('\n');

  const jsReset = `  [${cfg.metrics.map(m => `'${m.key}'`).join(', ')}].forEach(metric => {`;

  const jsGenerate = cfg.metrics.map(m => `  const ${m.key} = seededRandom(${m.range[0]}, ${m.range[1]}); // ${m.comment}`).join('\n');

  const jsVerdict = cfg.verdict;

  const html = `---
layout: default
title: "${cfg.title}"
description: "${cfg.description}"
permalink: /screeners/${cfg.slug}/
---

<section class="page-header screener-header">
  <div class="container">
    <div class="screener-title">
      <div class="screener-emoji">${cfg.emoji}</div>
      <h1>${cfg.h1}</h1>
      <p class="tagline">${cfg.tagline}</p>
      <p class="attribution">— ${cfg.attribution}</p>
    </div>
  </div>
</section>

<section class="screener-info">
  <div class="container">
    <div class="info-grid">
      <div class="info-main">
        <h2>${cfg.philosophyTitle}</h2>
        <p>${cfg.philosophy}</p>

        <h3>Key Principles</h3>
        <ul>
          ${cfg.principles.map(p => `          <li><strong>${p[0]}:</strong> ${p[1]}</li>`).join('\n')}
        </ul>

        <div class="fun-fact">
          <h4>💡 Did You Know?</h4>
          <p>${cfg.funFact}</p>
        </div>
      </div>

      <div class="info-sidebar">
        <div class="criteria-card">
          <h3>Screener Criteria</h3>
          ${criteriaHtml}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="ticker-analyzer">
  <div class="container">
    <h2 class="section-title">📊 Analyze Any Stock</h2>
    <p class="section-description">Enter a ticker symbol to see how it measures up against ${cfg.shortName}'s criteria</p>

    <div class="analyzer-card">
      <div class="ticker-input-section">
        <div class="input-group">
          <input type="text" id="ticker-input" placeholder="Enter ticker (e.g., ${cfg.exampleTickers.slice(0, 3).join(', ')})" maxlength="5">
          <button id="analyze-btn" class="btn btn-primary" onclick="analyzeStock()">
            <span id="btn-text">Analyze Stock</span>
            <span id="btn-loading" style="display: none;">Analyzing...</span>
          </button>
        </div>
        <p class="input-help">Try: ${cfg.exampleTickers.join(', ')}, or any US stock ticker</p>
        <div id="api-status" class="api-status"></div>
      </div>

      <div id="analysis-results" class="analysis-results" style="display: none;">
        <div class="result-header">
          <h3 id="company-name">Company Name</h3>
          <span id="result-ticker" class="result-ticker">TICKER</span>
        </div>

        <div class="metrics-grid">
          ${metricsHtml}
        </div>

        <div class="overall-score">
          <div class="score-header">
            <h4>${cfg.scoreName}</h4>
            <div class="score-value" id="${cfg.scoreId}">--/${cfg.metrics.length}</div>
          </div>
          <div class="score-bar">
            <div class="score-fill" id="score-fill" style="width: 0%"></div>
          </div>
          <p class="score-verdict" id="score-verdict">Enter a ticker to see results</p>
        </div>

        <div class="result-disclaimer">
          <p><strong>Demo Mode:</strong> This is an educational demonstration that generates realistic sample data. Results are based on the ticker symbol but do not reflect actual real-time financial metrics. In a production environment, this would connect to financial APIs like Alpha Vantage or Yahoo Finance. Always verify with official sources before making investment decisions.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="screener-demo">
  <div class="container">
    <h2 class="section-title">Example Results</h2>
    <p class="section-description">Companies matching ${cfg.shortName}'s criteria (for educational purposes only)</p>

    <div class="results-table-container">
      <div class="results-header">
        <span class="disclaimer-badge">📚 Educational Data</span>
        <span class="update-time">Updated: Delayed data for learning purposes</span>
      </div>

      <table class="results-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Ticker</th>
            ${cfg.tableHeaders.map(h => `<th>${h}</th>`).join('')}
            <th>${cfg.tableBadgeHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="table-legend">
        <div class="legend-item">
          <span class="legend-dot good"></span>
          <span>Meets Criteria</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot warn"></span>
          <span>Below Threshold</span>
        </div>
        <div class="legend-item">
          <span class="${cfg.badgeClass} strong">${cfg.legendBadge}</span>
          <span>${cfg.legendBadgeDesc}</span>
        </div>
      </div>
    </div>

    <div class="screener-actions">
      <a href="/screeners" class="btn btn-secondary">← Back to Screeners</a>
      <a href="/articles" class="btn btn-primary">Learn More About ${cfg.shortName}</a>
    </div>
  </div>
</section>

<section class="learn-more">
  <div class="container">
    <h2>Deep Dive: Understanding ${cfg.shortName}'s Criteria</h2>

    <div class="criteria-explanations">
      ${explanationsHtml}
    </div>
  </div>
</section>

${style}

<script>
// Demo mode: Generate realistic metrics based on ticker hash
// This ensures the same ticker always shows the same "random" results
async function analyzeStock() {
  const tickerInput = document.getElementById('ticker-input');
  const ticker = tickerInput.value.trim().toUpperCase();

  if (!ticker) {
    showError('Please enter a ticker symbol');
    return;
  }

  // Reset and show loading
  resetResults();
  showLoading(true);
  hideError();

  // Simulate API delay for realism
  await new Promise(resolve => setTimeout(resolve, 800));

  // Generate realistic demo metrics based on ticker
  // Using a hash function so the same ticker always gives the same results
  const hash = ticker.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  const seededRandom = (min, max) => {
    const x = Math.sin(hash + min) * 10000;
    return min + (x - Math.floor(x)) * (max - min);
  };

  // Company names mapping for common tickers
  const companyNames = {
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'GOOGL': 'Alphabet Inc.',
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'META': 'Meta Platforms Inc.',
    'NVDA': 'NVIDIA Corporation',
    'JPM': 'JPMorgan Chase & Co.',
    'V': 'Visa Inc.',
    'JNJ': 'Johnson & Johnson',
    'WMT': 'Walmart Inc.',
    'PG': 'Procter & Gamble',
    'KO': 'Coca-Cola',
    'DIS': 'Walt Disney',
    'NFLX': 'Netflix Inc.',
    'GME': 'GameStop Corp.',
    'AMC': 'AMC Entertainment',
    'CMG': 'Chipotle Mexican Grill',
    'LULU': 'Lululemon Athletica',
    'AMD': 'Advanced Micro Devices',
    'SHOP': 'Shopify Inc.',
    'SQ': 'Block Inc.',
    'RBLX': 'Roblox Corporation',
    'PLTR': 'Palantir Technologies'
  };

  const companyName = companyNames[ticker] || \`\${ticker} Corp.\`;

  // Generate ${cfg.shortName}-specific metrics
${jsGenerate}

  // Display results
  displayResults(ticker, companyName, {
    ${cfg.metrics.map(m => `${m.key}: ${m.key}`).join(', ')}
  });

  showLoading(false);
}

function displayResults(ticker, companyName, metrics) {
  const resultsDiv = document.getElementById('analysis-results');
  resultsDiv.style.display = 'block';

  // Update header
  document.getElementById('company-name').textContent = companyName;
  document.getElementById('result-ticker').textContent = ticker;

  // Evaluate each metric against ${cfg.shortName}'s criteria
  const evaluations = {
${jsMetrics}
  };

  // Update metric displays
${jsUpdate}

  // Calculate overall score
  const score = Object.values(evaluations).filter(e => e.pass).length;
  const maxScore = ${cfg.metrics.length};
  const percentage = (score / maxScore) * 100;

  // Update score display
  document.getElementById('${cfg.scoreId}').textContent = \`\${score}/\${maxScore}\`;
  document.getElementById('score-fill').style.width = \`\${percentage}%\`;

  // Generate verdict
  let verdict = '';
${jsVerdict}

  document.getElementById('score-verdict').textContent = verdict;

  // Scroll to results
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateMetric(metricName, value, passed) {
  const card = document.querySelector(\`[data-metric="\${metricName}"]\`);
  const statusEl = document.getElementById(\`status-\${metricName}\`);

  document.getElementById(\`metric-\${metricName}\`).textContent = value;

  // Remove loading state
  card.classList.remove('loading');

  if (passed) {
    card.classList.add('pass');
    statusEl.textContent = '✓ Pass';
    statusEl.classList.add('pass');
  } else {
    card.classList.add('fail');
    statusEl.textContent = '✗ Below Target';
    statusEl.classList.add('fail');
  }
}

${baseJsTail.replace('  [\'growth\', \'peg\', \'debt\', \'insider\', \'cap\'].forEach(metric => {', jsReset)}
</script>
`;

  fs.writeFileSync(path.join(BASE, 'screeners', `${cfg.slug}.html`), html);
  console.log(`✅ Wrote screeners/${cfg.slug}.html`);
}

const configs = [
  // ============ CHARLIE MUNGER ============
  {
    slug: 'munger',
    emoji: '🧠',
    h1: 'The Munger Screener',
    tagline: '"Invert, always invert."',
    attribution: 'Charlie Munger',
    title: 'Munger Screener - Find Owner-Operator Wonders',
    description: "Charlie Munger's quality investing criteria. Find owner-operator companies with high ROE, low debt, and durable competitive advantages.",
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    color: '#7c3aed',
    badgeClass: 'quality-badge',
    shortName: 'Munger',
    scoreName: 'Munger Score',
    scoreId: 'munger-score',
    philosophyTitle: "Charlie Munger's Philosophy",
    philosophy: "Charlie Munger was Warren Buffett's business partner and vice chairman of Berkshire Hathaway for over 50 years. While Buffett was the face, Munger was the brain — a lawyer-turned-investor who helped transform Berkshire from a struggling textile company into a $1 trillion empire. He believed in buying a few truly wonderful businesses and holding them for decades.",
    principles: [
      ['Inversion', "Instead of asking 'how do I succeed?', ask 'how do I guarantee failure?' and avoid it"],
      ['Owner-Operators', 'Prefer companies run by owners who treat the business like their own'],
      ['Wonderful Company, Fair Price', 'Quality matters more than a cheap entry price'],
      ['Lollapalooza Effects', 'Look for multiple positive forces working together'],
      ['Patience & Concentration', 'A few great bets beat many mediocre ones']
    ],
    funFact: "Munger was a lawyer, not a finance guy. He famously said, 'All I want to know is where I'm going to die, so I'll never go there.' He turned a $10,000 investment in See's Candy (1972) into a business that generated over $2 billion in profits!",
    criteria: [
      { name: 'Return on Equity (ROE)', value: '> 20%', desc: 'Consistent, capital-efficient' },
      { name: 'Debt-to-Equity', value: '< 0.5', desc: 'Strong balance sheet' },
      { name: 'Free Cash Flow', value: 'Positive', desc: 'Real cash generation' },
      { name: 'Revenue Growth', value: 'Consistent', desc: 'Steady 5-year track record' },
      { name: 'Owner-Operator', value: 'Yes', desc: 'Management acts like an owner' }
    ],
    exampleTickers: ['AAPL', 'KO', 'COST', 'MCO', 'OXY'],
    metrics: [
      { key: 'roe', label: 'Return on Equity (ROE)', target: '> 20%', threshold: 20, passExpr: 'metrics.roe > 20', format: 'evaluations.roe.value.toFixed(1) + \'%\'' , range: [8, 60], comment: 'ROE 8-60%' },
      { key: 'debt', label: 'Debt-to-Equity', target: '< 0.5', threshold: 0.5, passExpr: 'metrics.debt < 0.5', format: 'evaluations.debt.value.toFixed(2)', range: [0.05, 2.0], comment: 'Debt/Equity 0.05-2.0' },
      { key: 'fcf', label: 'Free Cash Flow', target: 'Positive', threshold: 0, passExpr: 'metrics.fcf > 0', format: 'evaluations.fcf.value >= 0 ? \'+$\' + evaluations.fcf.value.toFixed(1) + \'B\' : \'-$\' + Math.abs(evaluations.fcf.value).toFixed(1) + \'B\'', range: [-2, 20], comment: 'FCF -$2B to +$20B' },
      { key: 'growth', label: 'Revenue Growth', target: '> 5%', threshold: 5, passExpr: 'metrics.growth > 5', format: 'evaluations.growth.value.toFixed(1) + \'%\'' , range: [-5, 30], comment: 'Revenue growth -5 to 30%' },
      { key: 'owner', label: 'Owner-Operator', target: 'Yes', threshold: 50, passExpr: 'metrics.owner > 50', format: 'evaluations.owner.value > 50 ? \'Yes\' : \'No\'', range: [10, 95], comment: 'Owner-operator score 10-95' }
    ],
    tableHeaders: ['ROE', 'Debt/Eq', 'FCF', 'Growth'],
    tableBadgeHeader: 'Owner-Op',
    legendBadge: 'Owner-Operator',
    legendBadgeDesc: 'Management acts like an owner',
    tableRows: [
      { name: 'Apple Inc.', desc: 'Consumer electronics', ticker: 'AAPL', cells: [['35%', 'good'], ['0.3', 'good'], ['+$100B', 'good'], ['8%', 'good']], badge: ['Yes', 'strong'] },
      { name: 'Coca-Cola', desc: 'Beverages', ticker: 'KO', cells: [['42%', 'good'], ['0.9', 'warn'], ['+$9B', 'good'], ['3%', 'warn']], badge: ['Yes', 'strong'] },
      { name: 'Costco', desc: 'Warehouse retail', ticker: 'COST', cells: [['28%', 'good'], ['0.7', 'warn'], ['+$13B', 'good'], ['9%', 'good']], badge: ['Yes', 'strong'] },
      { name: 'Marsh & McLennan', desc: 'Risk & insurance', ticker: 'MC', cells: [['31%', 'good'], ['0.4', 'good'], ['+$4B', 'good'], ['12%', 'good']], badge: ['No', 'moderate'] }
    ],
    explanations: [
      {
        title: '🔄 Inversion: Thinking Backwards',
        intro: "Munger's favorite mental tool is inversion — instead of asking how to succeed, figure out how to guarantee failure and avoid it:",
        points: [
          ['The Question', "Ask: 'What would destroy this business?'"],
          ['Avoid Stupidity', 'Success often comes from not doing dumb things'],
          ['Checklist Thinking', 'Build checklists of failure modes and screen them out'],
          ['Example', 'A company that depends on one customer, one product, and heavy debt is one bad quarter from disaster']
        ]
      },
      {
        title: '👔 Owner-Operators',
        intro: "Munger looks for management that behaves like the business is their own family fortune:",
        points: [
          ['Skin in the Game', 'Executives who own large chunks of their own company'],
          ['Frugality', 'Capital is spent like it comes from their own pocket'],
          ['Long-Term Focus', 'They build for decades, not quarterly earnings'],
          ['Red Flags', 'Excessive salaries, empire-building acquisitions, flashy jets']
        ]
      },
      {
        title: '🏆 The Lollapalooza Effect',
        intro: 'Munger coined this term for when multiple psychological and economic forces combine to create an extreme outcome:',
        points: [
          ['Brand + Moat', 'A beloved brand with switching costs creates unstoppable demand'],
          ['Network Effects', 'More users make the product more valuable for everyone'],
          ['Compound Interest', 'Time amplifies any advantage — the longer you hold, the bigger the effect'],
          ['Berkshire Proof', 'See\'s Candy + brand loyalty + pricing power + decades of time = billions in profits']
        ]
      }
    ],
    verdict: `if (score === 5) verdict = '🧠 Excellent! This stock meets all of Munger\\'s key criteria!';
  else if (score >= 4) verdict = '✅ Good match! This stock meets most of Munger\\'s criteria.';
  else if (score >= 3) verdict = '⚠️ Partial match. Some criteria are met, but not all.';
  else verdict = '❌ Doesn\\'t match Munger\\'s criteria well. Consider other options.';`
  },

  // ============ JOEL GREENBLATT ============
  {
    slug: 'greenblatt',
    emoji: '🪄',
    h1: 'The Greenblatt Screener',
    tagline: '"The Magic Formula: buy great companies at great prices."',
    attribution: 'Joel Greenblatt',
    title: 'Greenblatt Screener - The Magic Formula',
    description: "Joel Greenblatt's Magic Formula investing criteria. Rank companies by earnings yield and return on capital to find cheap, high-quality businesses.",
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#059669',
    badgeClass: 'magic-badge',
    shortName: 'Greenblatt',
    scoreName: 'Magic Formula Score',
    scoreId: 'greenblatt-score',
    philosophyTitle: "Joel Greenblatt's Philosophy",
    philosophy: "Joel Greenblatt is a Yale professor and hedge fund manager who discovered the 'Magic Formula' — a simple, mechanical way to find stocks that are both high-quality AND cheap. His formula beats the S&P 500 most years by ranking every company on two numbers: earnings yield (how cheap it is) and return on capital (how good it is).",
    principles: [
      ['Two Numbers Only', 'Earnings yield and return on capital — nothing else'],
      ['Rank Everything', 'Score all companies, then buy the top-ranked basket'],
      ['Diversification', 'Buy 20-30 stocks, not one or two'],
      ['Hold & Rotate', 'Hold for a year, then re-rank and swap'],
      ['Discipline Over Opinion', 'The formula removes emotion from investing']
    ],
    funFact: "Greenblatt's Magic Formula returned 30% per year (vs. 16% for the S&P 500) over a 20-year period in his book 'The Little Book That Beats the Market'. He says the secret isn't genius — it's doing the boring math that other investors are too lazy or emotional to do.",
    criteria: [
      { name: 'Earnings Yield (EBIT/EV)', value: '> 10%', desc: 'Cheap relative to earnings' },
      { name: 'Return on Capital (EBIT/NWC)', value: '> 15%', desc: 'High-quality capital use' },
      { name: 'Enterprise Value', value: 'Any', desc: 'Price minus cash plus debt' },
      { name: 'Net Working Capital', value: 'Positive', desc: 'Operating efficiency' },
      { name: 'Rank Position', value: 'Top 20', desc: 'Buy the highest-ranked basket' }
    ],
    exampleTickers: ['COST', 'MCD', 'ORCL', 'UNH', 'CAT'],
    metrics: [
      { key: 'ey', label: 'Earnings Yield (EBIT/EV)', target: '> 10%', threshold: 10, passExpr: 'metrics.ey > 10', format: 'evaluations.ey.value.toFixed(1) + \'%\'' , range: [2, 25], comment: 'Earnings yield 2-25%' },
      { key: 'roc', label: 'Return on Capital', target: '> 15%', threshold: 15, passExpr: 'metrics.roc > 15', format: 'evaluations.roc.value.toFixed(1) + \'%\'' , range: [3, 45], comment: 'Return on capital 3-45%' },
      { key: 'ev', label: 'Enterprise Value', target: 'Any size', threshold: 0, passExpr: 'metrics.ev > 0', format: '$' + 'evaluations.ev.value.toFixed(0) + \'B\'', range: [1, 3000], comment: 'Enterprise value $1B-$3000B' },
      { key: 'nwc', label: 'Net Working Capital', target: 'Positive', threshold: 0, passExpr: 'metrics.nwc > 0', format: 'evaluations.nwc.value >= 0 ? \'+$\' + evaluations.nwc.value.toFixed(1) + \'B\' : \'-$\' + Math.abs(evaluations.nwc.value).toFixed(1) + \'B\'', range: [-3, 30], comment: 'NWC -$3B to +$30B' },
      { key: 'rank', label: 'Magic Formula Rank', target: 'Top 20', threshold: 20, passExpr: 'metrics.rank <= 20', format: '#' + 'evaluations.rank.value.toFixed(0)', range: [1, 100], comment: 'Rank 1-100' }
    ],
    tableHeaders: ['Earnings Yield', 'Return on Cap', 'EV', 'Rank'],
    tableBadgeHeader: 'Magic Pick',
    legendBadge: 'Top Pick',
    legendBadgeDesc: 'Ranks in the top basket',
    tableRows: [
      { name: 'Costco', desc: 'Warehouse retail', ticker: 'COST', cells: [['14.2%', 'good'], ['28.5%', 'good'], ['$400B', 'good'], ['#3', 'good']], badge: ['Top Pick', 'strong'] },
      { name: 'McDonald\'s', desc: 'Fast food', ticker: 'MCD', cells: [['11.8%', 'good'], ['19.2%', 'good'], ['$190B', 'good'], ['#7', 'good']], badge: ['Top Pick', 'strong'] },
      { name: 'Caterpillar', desc: 'Heavy machinery', ticker: 'CAT', cells: [['12.5%', 'good'], ['16.8%', 'good'], ['$140B', 'good'], ['#12', 'good']], badge: ['Top Pick', 'strong'] },
      { name: 'Netflix', desc: 'Streaming', ticker: 'NFLX', cells: [['4.1%', 'warn'], ['22.3%', 'good'], ['$300B', 'good'], ['#45', 'warn']], badge: ['Watch', 'moderate'] }
    ],
    explanations: [
      {
        title: '🪄 The Magic Formula Explained',
        intro: "Greenblatt's formula ranks every company on two numbers, then combines the ranks:",
        points: [
          ['Earnings Yield', 'EBIT ÷ Enterprise Value — like a bond yield, higher is cheaper'],
          ['Return on Capital', 'EBIT ÷ Net Working Capital — higher means the business is excellent at using money'],
          ['Combine Ranks', 'Add the two ranks together; the lowest total wins'],
          ['Buy the Basket', 'Buy the top 20-30 companies, hold for a year, then re-rank']
        ]
      },
      {
        title: '💵 Enterprise Value: The Real Price',
        intro: "Greenblatt doesn't use market cap — he uses Enterprise Value, the true cost of buying the whole company:",
        points: [
          ['The Formula', 'EV = Market Cap + Debt − Cash'],
          ['Why It Matters', 'A company with $10B in cash is cheaper than one without, at the same stock price'],
          ['EBIT', 'Earnings Before Interest and Taxes — profit from operations alone'],
          ['Net Working Capital', 'Current assets minus current liabilities — the money needed to run daily operations']
        ]
      },
      {
        title: '📊 Why It Beats the Market',
        intro: 'The Magic Formula works because it forces you to buy what most investors avoid:',
        points: [
          ['Boring Wins', 'The top-ranked stocks are usually unglamorous companies nobody talks about'],
          ['Cheap + Good', 'Most investors pick either cheap OR good — the formula requires both'],
          ['Discipline', 'It removes your ability to cherry-pick favorites'],
          ['The Catch', 'It still has losing years — the key is staying the course for decades']
        ]
      }
    ],
    verdict: `if (score === 5) verdict = '🪄 Excellent! This stock meets all of Greenblatt\\'s Magic Formula criteria!';
  else if (score >= 4) verdict = '✅ Good match! This stock meets most of the Magic Formula criteria.';
  else if (score >= 3) verdict = '⚠️ Partial match. Some criteria are met, but not all.';
  else verdict = '❌ Doesn\\'t rank well in the Magic Formula. Consider other options.';`
  },

  // ============ WILLIAM O'NEIL ============
  {
    slug: 'oneil',
    emoji: '📈',
    h1: "The O'Neil Screener",
    tagline: '"Buy strength, sell weakness."',
    attribution: "William O'Neil",
    title: "O'Neil Screener - CAN SLIM Growth Stocks",
    description: "William O'Neil's CAN SLIM growth investing criteria. Find leading companies with strong earnings acceleration, new products, and powerful chart patterns.",
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    color: '#0284c7',
    badgeClass: 'canslim-badge',
    shortName: "O'Neil",
    scoreName: "CAN SLIM Score",
    scoreId: 'oneil-score',
    philosophyTitle: "William O'Neil's Philosophy",
    philosophy: "William O'Neil founded Investor's Business Daily and discovered that virtually every great stock in history followed the same pattern before its big run. His CAN SLIM system combines fundamentals (earnings, growth) with technicals (chart patterns, market timing) to find leading stocks at the moment they're about to break out.",
    principles: [
      ['Current Earnings', 'Look for accelerating earnings, not just growth'],
      ['Annual Growth', 'Consistent 25%+ growth over several years'],
      ['New Things', 'New products, management, or highs create momentum'],
      ['Supply & Demand', 'Tight float and rising volume signal a breakout'],
      ['Leader or Laggard', 'Buy the strongest stocks in the strongest sectors']
    ],
    funFact: "O'Neil studied every major market top and bottom from 1900 to 1990 and found that leading stocks before a bull market share the same traits: surging earnings, new highs, and heavy volume on breakouts. His system has been used by thousands of investors to find stocks like Apple in 1984, Microsoft in 1986, and NVIDIA in 2016.",
    criteria: [
      { name: 'Quarterly EPS Growth', value: '> 25%', desc: 'Year-over-year acceleration' },
      { name: 'Annual EPS Growth', value: '> 25%', desc: '3-5 year average' },
      { name: 'ROE', value: '> 17%', desc: 'Profitable and efficient' },
      { name: 'Relative Strength', value: '> 80', desc: 'Outperforming the market' },
      { name: 'Volume Trend', value: 'Rising', desc: 'Institutional interest building' }
    ],
    exampleTickers: ['NVDA', 'AVGO', 'CRM', 'PANW', 'APP'],
    metrics: [
      { key: 'qeps', label: 'Quarterly EPS Growth', target: '> 25%', threshold: 25, passExpr: 'metrics.qeps > 25', format: 'evaluations.qeps.value.toFixed(1) + \'%\'' , range: [-10, 80], comment: 'Quarterly EPS growth -10 to 80%' },
      { key: 'aeps', label: 'Annual EPS Growth', target: '> 25%', threshold: 25, passExpr: 'metrics.aeps > 25', format: 'evaluations.aeps.value.toFixed(1) + \'%\'' , range: [5, 60], comment: 'Annual EPS growth 5-60%' },
      { key: 'roe', label: 'Return on Equity (ROE)', target: '> 17%', threshold: 17, passExpr: 'metrics.roe > 17', format: 'evaluations.roe.value.toFixed(1) + \'%\'' , range: [5, 45], comment: 'ROE 5-45%' },
      { key: 'rs', label: 'Relative Strength Rating', target: '> 80', threshold: 80, passExpr: 'metrics.rs > 80', format: evaluations => `evaluations.rs.value.toFixed(0)`, range: [40, 99], comment: 'RS rating 40-99' },
      { key: 'vol', label: 'Volume Trend', target: 'Rising', threshold: 50, passExpr: 'metrics.vol > 50', format: 'evaluations.vol.value > 50 ? \'Rising\' : \'Flat/Falling\'', range: [20, 95], comment: 'Volume trend 20-95' }
    ],
    tableHeaders: ['Q EPS', 'A EPS', 'ROE', 'RS'],
    tableBadgeHeader: 'Leader',
    legendBadge: 'Market Leader',
    legendBadgeDesc: 'Strongest in its sector',
    tableRows: [
      { name: 'NVIDIA', desc: 'Semiconductors', ticker: 'NVDA', cells: [['72%', 'good'], ['48%', 'good'], ['42%', 'good'], ['97', 'good']], badge: ['Leader', 'strong'] },
      { name: 'Broadcom', desc: 'Semiconductors', ticker: 'AVGO', cells: [['34%', 'good'], ['28%', 'good'], ['24%', 'good'], ['89', 'good']], badge: ['Leader', 'strong'] },
      { name: 'Salesforce', desc: 'Cloud software', ticker: 'CRM', cells: [['28%', 'good'], ['22%', 'warn'], ['21%', 'good'], ['82', 'good']], badge: ['Strong', 'moderate'] },
      { name: 'Palo Alto Networks', desc: 'Cybersecurity', ticker: 'PANW', cells: [['18%', 'warn'], ['26%', 'good'], ['19%', 'good'], ['78', 'warn']], badge: ['Building', 'moderate'] }
    ],
    explanations: [
      {
        title: '🔤 CAN SLIM Decoded',
        intro: "Each letter in CAN SLIM is a checklist item O'Neil requires before buying:",
        points: [
          ['C — Current earnings', 'Quarterly EPS up 25%+ year-over-year, and accelerating'],
          ['A — Annual earnings', '3-5 year average EPS and revenue growth of 25%+'],
          ['N — New things', 'New product, new management, or new stock highs'],
          ['S — Supply & demand', 'Floating shares are limited; volume is rising'],
          ['L — Leader', 'RS rating above 80; buy the strongest, not the cheapest'],
          ['I — Institutional', 'Smart money (mutual/ hedge funds) is accumulating'],
          ['M — Market direction', 'The overall market must be in an uptrend']
        ]
      },
      {
        title: '📊 Relative Strength: Buy Winners',
        intro: "O'Neil's most counterintuitive rule: don't buy cheap stocks — buy strong ones:",
        points: [
          ['RS Rating', 'A 0-100 score of how a stock outperforms the S&P 500 over 12 months'],
          ['Above 80', 'The stock is in the top 20% of all stocks — a true leader'],
          ['Why It Works', 'Strong stocks tend to keep going strong; weak stocks keep going weak'],
          ['The Trap', 'Waiting for a "cheap" dip often means catching a falling knife']
        ]
      },
      {
        title: '🚀 The Cup-with-Handle Pattern',
        intro: "O'Neil's signature chart pattern appears before most big breakouts:",
        points: [
          ['The Cup', 'Stock rises, pulls back in a rounded "U" shape over 1-6 months'],
          ['The Handle', 'A small, tight pullback near the top — the "shakeout"'],
          ['The Pivot', 'Buy when price breaks above the handle on 40%+ above-average volume'],
          ['Stop Loss', 'Cut losses at 7-8% below your buy price — no exceptions']
        ]
      }
    ],
    verdict: `if (score === 5) verdict = '📈 Excellent! This stock meets all of O\\'Neil\\'s CAN SLIM criteria!';
  else if (score >= 4) verdict = '✅ Good match! This stock meets most of the CAN SLIM criteria.';
  else if (score >= 3) verdict = '⚠️ Partial match. Some criteria are met, but not all.';
  else verdict = '❌ Doesn\\'t match CAN SLIM criteria well. Consider other options.';`
  }
];

configs.forEach(buildScreener);
console.log('✅ Done!');
