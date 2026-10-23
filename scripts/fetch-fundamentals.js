#!/usr/bin/env node
/**
 * Fetches real fundamental data from Yahoo Finance for all tickers used in the screeners.
 * Writes the results to assets/data/fundamentals.json.
 *
 * Usage: node scripts/fetch-fundamentals.js
 *
 * No API key required. Uses Yahoo Finance's public endpoints with a cookie/crumb trick.
 */

const fs = require('fs');
const path = require('path');

// All tickers used across the screener pages
const TICKERS = [
  'AAPL', 'AMD', 'AVGO', 'AXP', 'BAC', 'BMY', 'CAT', 'CMG', 'COST',
  'CRM', 'INTC', 'KO', 'LULU', 'MC', 'MCD', 'NFLX', 'NVDA', 'PANW',
  'PG', 'RBLX', 'T', 'VZ', 'WDC'
];

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'fundamentals.json');

// ─── Yahoo Finance helpers ───────────────────────────────────────────────

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers,
        },
      });
      if (res.status === 429) {
        const wait = (i + 1) * 2000;
        console.log(`  ⏳ Rate limited, waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = (i + 1) * 1500;
      console.log(`  ⚠️  ${err.message}, retrying in ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Get a Yahoo Finance crumb (required for quoteSummary API).
 * Returns { cookie, crumb } for use in subsequent requests.
 */
async function getYahooCrumb() {
  // Step 1: Hit fc.yahoo.com to get a cookie
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const setCookie = cookieRes.headers.get('set-cookie');
  if (!setCookie) throw new Error('Failed to get Yahoo cookie');
  const cookie = setCookie.split(';')[0]; // e.g. "A1=..."

  // Step 2: Get crumb using that cookie
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookie,
    },
  });
  const crumb = await crumbRes.text();
  if (!crumb || crumb.length < 5) throw new Error(`Failed to get crumb: "${crumb}"`);

  return { cookie, crumb };
}

/**
 * Fetch quoteSummary for a single ticker.
 */
async function fetchQuoteSummary(ticker, cookie, crumb) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,defaultKeyStatistics,financialData,price&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookie,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);
  const data = await res.json();
  if (!data.quoteSummary?.result?.[0]) {
    throw new Error(`No data for ${ticker}: ${JSON.stringify(data.quoteSummary?.error || 'unknown')}`);
  }
  return data.quoteSummary.result[0];
}

// ─── Data extraction ─────────────────────────────────────────────────────

function safeGet(obj, ...keys) {
  for (const k of keys) {
    if (obj == null) return null;
    obj = obj[k];
  }
  return typeof obj === 'object' && obj !== null ? obj.raw : obj;
}

function extractFundamentals(result, ticker) {
  const sd = result.summaryDetail || {};
  const ks = result.defaultKeyStatistics || {};
  const fd = result.financialData || {};
  const price = result.price || {};

  return {
    ticker,
    name: safeGet(price, 'longName') || safeGet(price, 'shortName') || `${ticker} Corp.`,
    price: safeGet(price, 'regularMarketPrice'),
    marketCap: safeGet(sd, 'marketCap'),
    // Valuation
    pe: safeGet(sd, 'trailingPE'),
    forwardPe: safeGet(sd, 'forwardPE'),
    priceToBook: safeGet(ks, 'priceToBook'),
    enterpriseToEbitda: safeGet(ks, 'enterpriseToEbitda'),
    dividendYield: safeGet(sd, 'dividendYield'),
    // Profitability
    roe: safeGet(fd, 'returnOnEquity'),
    roa: safeGet(fd, 'returnOnAssets'),
    profitMargin: safeGet(fd, 'profitMargins'),
    operatingMargin: safeGet(fd, 'operatingMargins'),
    grossMargin: safeGet(fd, 'grossMargins'),
    // Growth
    earningsGrowth: safeGet(fd, 'earningsGrowth'),
    revenueGrowth: safeGet(fd, 'revenueGrowth'),
    earningsQuarterlyGrowth: safeGet(ks, 'earningsQuarterlyGrowth'),
    // Balance sheet
    debtToEquity: safeGet(fd, 'debtToEquity'),
    currentRatio: safeGet(fd, 'currentRatio'),
    quickRatio: safeGet(fd, 'quickRatio'),
    totalCash: safeGet(fd, 'totalCash'),
    totalDebt: safeGet(fd, 'totalDebt'),
    // Cash flow
    freeCashFlow: safeGet(fd, 'freeCashflow'),
    operatingCashFlow: safeGet(fd, 'operatingCashflow'),
    // Ownership
    insiderOwnership: safeGet(ks, 'heldPercentInsiders'),
    institutionalOwnership: safeGet(ks, 'heldPercentInstitutions'),
    // 52-week range
    fiftyTwoWeekHigh: safeGet(sd, 'fiftyTwoWeekHigh'),
    fiftyTwoWeekLow: safeGet(sd, 'fiftyTwoWeekLow'),
    // Analyst
    targetPrice: safeGet(fd, 'targetMeanPrice'),
    recommendation: safeGet(fd, 'recommendationMean'),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Fetching fundamentals from Yahoo Finance...\n');

  // Get auth
  console.log('Getting Yahoo Finance auth...');
  const { cookie, crumb } = await getYahooCrumb();
  console.log(`  Crumb: ${crumb}\n`);

  const results = {};
  const errors = [];

  for (let i = 0; i < TICKERS.length; i++) {
    const ticker = TICKERS[i];
    process.stdout.write(`  [${i + 1}/${TICKERS.length}] ${ticker}... `);
    try {
      const result = await fetchQuoteSummary(ticker, cookie, crumb);
      results[ticker] = extractFundamentals(result, ticker);
      console.log(`✓ ${results[ticker].name} @ $${results[ticker].price?.toFixed(2)}`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      errors.push({ ticker, error: err.message });
    }

    // Be polite: 500ms between requests
    if (i < TICKERS.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Build output
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'Yahoo Finance',
    disclaimer: 'Data is delayed and for educational purposes only. Not investment advice.',
    tickers: results,
  };

  // Write file
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Wrote ${path.relative(process.cwd(), OUTPUT_FILE)}`);
  console.log(`   ${Object.keys(results).length}/${TICKERS.length} tickers successful`);

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errors:`);
    errors.forEach(e => console.log(`   ${e.ticker}: ${e.error}`));
  }

  // Exit with error if we got nothing
  if (Object.keys(results).length === 0) {
    console.error('\n❌ No data fetched. Aborting.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
