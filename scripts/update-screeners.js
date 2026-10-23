#!/usr/bin/env node
/**
 * Updates all screener HTML files to use real fundamentals data.
 * Replaces the entire inline <script> block with a new version that
 * supports real data from fundamentals.json with demo mode fallback.
 */

const fs = require('fs');
const path = require('path');

const SCREENERS_DIR = path.join(__dirname, '..', 'screeners');

const SCREENERS = {
  'buffett': {
    metrics: ['roe', 'debt', 'fcf', 'margin'],
    extract: `
      const roe = d.roe != null ? d.roe * 100 : null;
      const debt = d.debtToEquity != null ? d.debtToEquity / 100 : null;
      const fcf = d.freeCashFlow;
      const margin = d.profitMargin != null ? d.profitMargin * 100 : null;`,
    demo: `
      const roe = sr(5, 40);
      const debt = sr(0.1, 3.0);
      const fcf = sr(1000000000, 50000000000);
      const margin = sr(3, 35);`,
    scoreId: 'buffett-score',
    scoreName: 'Buffett',
  },
  'graham': {
    metrics: ['pe', 'pb', 'yield', 'current', 'debt'],
    extract: `
      const pe = d.pe;
      const pb = d.priceToBook;
      const yield_val = d.dividendYield != null ? d.dividendYield * 100 : null;
      const current = d.currentRatio;
      const debt = d.debtToEquity != null ? d.debtToEquity / 100 : null;`,
    demo: `
      const pe = sr(5, 35);
      const pb = sr(0.5, 3.0);
      const yield_val = sr(0, 8);
      const current = sr(0.5, 4.0);
      const debt = sr(0.1, 2.5);`,
    varMap: { yield: 'yield_val' },
    scoreId: 'graham-score',
    scoreName: 'Graham',
  },
  'lynch': {
    metrics: ['growth', 'peg', 'debt', 'insider', 'cap'],
    extract: `
      const growth = d.earningsGrowth != null ? d.earningsGrowth * 100 : null;
      const peg = (d.pe != null && growth != null && growth > 0) ? d.pe / growth : null;
      const debt = d.debtToEquity != null ? d.debtToEquity / 100 : null;
      const insider = d.insiderOwnership != null ? d.insiderOwnership * 100 : null;
      const cap = d.marketCap != null ? d.marketCap / 1e9 : null;`,
    demo: `
      const growth = sr(5, 45);
      const peg = sr(0.5, 3.0);
      const debt = sr(0.05, 1.5);
      const insider = sr(0.5, 35);
      const cap = sr(0.5, 50);`,
    scoreId: 'lynch-score',
    scoreName: 'Lynch',
  },
  'icahn': {
    metrics: ['pb', 'fcf', 'cash', 'underperform', 'institutional'],
    extract: `
      const pb = d.priceToBook;
      const fcf = d.freeCashFlow;
      const cash = d.totalCash;
      const underperform = (d.price != null && d.fiftyTwoWeekHigh != null) ? d.price < d.fiftyTwoWeekHigh * 0.85 : null;
      const institutional = d.institutionalOwnership != null ? d.institutionalOwnership * 100 : null;`,
    demo: `
      const pb = sr(0.3, 1.5);
      const fcf = sr(-2000000000, 15000000000);
      const cash = sr(500000000, 30000000000);
      const underperform = sr(0, 1) > 0.4;
      const institutional = sr(30, 85);`,
    scoreId: 'icahn-score',
    scoreName: 'Icahn',
  },
  'munger': {
    metrics: ['roe', 'debt', 'fcf', 'growth', 'owner'],
    extract: `
      const roe = d.roe != null ? d.roe * 100 : null;
      const debt = d.debtToEquity != null ? d.debtToEquity / 100 : null;
      const fcf = d.freeCashFlow != null ? d.freeCashFlow / 1e9 : null;
      const growth = d.revenueGrowth != null ? d.revenueGrowth * 100 : null;
      const owner = d.insiderOwnership != null ? d.insiderOwnership * 100 : null;`,
    demo: `
      const roe = sr(8, 60);
      const debt = sr(0.05, 2);
      const fcf = sr(-2, 20);
      const growth = sr(-5, 30);
      const owner = sr(10, 95);`,
    scoreId: 'munger-score',
    scoreName: 'Munger',
  },
  'greenblatt': {
    metrics: ['ey', 'roc', 'ev', 'nwc', 'rank'],
    extract: `
      const evEbitda = d.enterpriseToEbitda;
      const ey = evEbitda != null ? (1 / evEbitda) * 100 : null;
      const roc = d.roa != null ? d.roa * 100 : null;
      const ev = ((d.marketCap || 0) + (d.totalDebt || 0) - (d.totalCash || 0)) / 1e9;
      const nwc = d.currentRatio != null ? (d.currentRatio - 1) * (d.marketCap || 0) / 1e9 : null;
      let rank = null;
      if (ey != null && roc != null) {
        const score = (100 - Math.min(ey, 50) * 2) + (100 - Math.min(roc, 50) * 2);
        rank = Math.max(1, Math.min(100, Math.round(score / 2)));
      }`,
    demo: `
      const ey = sr(2, 25);
      const roc = sr(3, 45);
      const ev = sr(1, 3000);
      const nwc = sr(-3, 30);
      const rank = sr(1, 100);`,
    scoreId: 'greenblatt-score',
    scoreName: 'Greenblatt',
  },
  'oneil': {
    metrics: ['qeps', 'aeps', 'roe', 'rs', 'vol'],
    extract: `
      const qeps = d.earningsQuarterlyGrowth != null ? d.earningsQuarterlyGrowth * 100 : null;
      const aeps = d.earningsGrowth != null ? d.earningsGrowth * 100 : null;
      const roe = d.roe != null ? d.roe * 100 : null;
      const rs = computeRS(d.price, d.fiftyTwoWeekHigh, d.fiftyTwoWeekLow);
      const vol = computeVolTrend(d.price, d.fiftyTwoWeekHigh, d.fiftyTwoWeekLow);`,
    demo: `
      const qeps = sr(-10, 80);
      const aeps = sr(5, 60);
      const roe = sr(5, 45);
      const rs = sr(40, 99);
      const vol = sr(20, 95);`,
    scoreId: 'oneil-score',
    scoreName: "O'Neil",
  },
};

/**
 * For each screener, extract the existing displayResults, updateMetric,
 * resetResults, showLoading, showError, hideError functions from the
 * original file, and prepend the new analyzeStock + helpers.
 */
function updateScreener(name) {
  const filePath = path.join(SCREENERS_DIR, `${name}.html`);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${name}.html not found, skipping`);
    return;
  }
  
  let html = fs.readFileSync(filePath, 'utf-8');
  const cfg = SCREENERS[name];
  
  // Find the last <script> block
  const lastScriptStart = html.lastIndexOf('<script>');
  const lastScriptEnd = html.lastIndexOf('</script>');
  
  if (lastScriptStart === -1 || lastScriptEnd === -1) {
    console.log(`  ⚠️  Could not find script block in ${name}.html`);
    return;
  }
  
  const oldScriptContent = html.substring(lastScriptStart + 8, lastScriptEnd);
  
  // Extract the functions we want to keep (everything after analyzeStock)
  // Find "function displayResults" which starts the "keep" section
  const keepStart = oldScriptContent.indexOf('function displayResults');
  if (keepStart === -1) {
    console.log(`  ⚠️  Could not find displayResults in ${name}.html`);
    return;
  }
  
  const keepContent = oldScriptContent.substring(keepStart);
  
  // Build the new analyzeStock
  const metrics = cfg.metrics;
  const varMap = cfg.varMap || {};
  const metricsObj = metrics.map(m => {
    const varName = varMap[m] || m;
    return `${m}: ${varName}`;
  }).join(', ');
  
  const newAnalyzeStock = `// Real data + demo fallback
async function analyzeStock() {
  const tickerInput = document.getElementById('ticker-input');
  const ticker = tickerInput.value.trim().toUpperCase();
  
  if (!ticker) {
    showError('Please enter a ticker symbol');
    return;
  }
  
  resetResults();
  showLoading(true);
  hideError();
  
  await loadFundamentals();
  await new Promise(resolve => setTimeout(resolve, 400));
  
  const realData = getFundamentals(ticker);
  let metrics;
  let companyName;
  let isReal = false;
  
  if (realData) {
    companyName = realData.name;
    isReal = true;
    const d = realData;
    ${cfg.extract}
    metrics = { ${metricsObj} };
  } else {
    companyName = ticker + ' Corp.';
    const hash = ticker.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const sr = (min, max) => {
      const x = Math.sin(hash + min) * 10000;
      return min + (x - Math.floor(x)) * (max - min);
    };
    ${cfg.demo}
    metrics = { ${metricsObj} };
  }
  
  const statusEl = document.getElementById('api-status');
  if (isReal) {
    const status = getDataStatus();
    statusEl.textContent = '📊 Real data as of ' + (status ? status.date : 'last close');
    statusEl.className = 'api-status';
  } else {
    statusEl.textContent = '🎮 Demo mode — try: ' + getDemoTickers().join(', ');
    statusEl.className = 'api-status';
  }
  
  displayResults(ticker, companyName, metrics);
  showLoading(false);
}

// Helper functions
function computeRS(price, high52, low52) {
  if (!price || !high52 || !low52 || high52 === low52) return 50;
  const position = (price - low52) / (high52 - low52);
  return Math.round(20 + position * 79);
}
function computeVolTrend(price, high52, low52) {
  if (!price || !high52 || !low52) return 50;
  const position = (price - low52) / (high52 - low52);
  return Math.round(20 + position * 70);
}
function getDemoTickers() {
  if (typeof fundamentalsData === 'undefined' || !fundamentalsData) return ['AAPL', 'KO', 'NVDA'];
  return Object.keys(fundamentalsData.tickers).slice(0, 5);
}

`;
  
  const newScriptContent = newAnalyzeStock + keepContent;
  
  // Replace the script content
  html = html.substring(0, lastScriptStart + 8) + newScriptContent + html.substring(lastScriptEnd);
  
  // Add fundamentals.js script tag before the inline script if not present
  if (!html.includes('fundamentals.js')) {
    const inlineScriptIdx = html.lastIndexOf('<script>');
    html = html.substring(0, inlineScriptIdx) + 
      '<script src="/assets/js/fundamentals.js"></script>\n' + 
      html.substring(inlineScriptIdx);
  }
  
  fs.writeFileSync(filePath, html);
  console.log(`  ✅ ${name}.html updated`);
}

console.log('Updating screener files with real data support...\n');
for (const name of Object.keys(SCREENERS)) {
  updateScreener(name);
}
console.log('\nDone!');
