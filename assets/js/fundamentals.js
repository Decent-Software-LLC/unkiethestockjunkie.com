/**
 * Fundamentals data loader for Unkie The Stock Junkie screeners.
 * Loads real market data from assets/data/fundamentals.json (updated daily
 * by GitHub Action after market close). Falls back to demo mode if data
 * is missing or stale.
 */

let fundamentalsData = null;
let fundamentalsLoaded = false;

/**
 * Load fundamentals JSON. Returns a promise that resolves when done.
 * Safe to call multiple times — only loads once.
 */
async function loadFundamentals() {
  if (fundamentalsLoaded) return fundamentalsData;
  
  try {
    const res = await fetch('/assets/data/fundamentals.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fundamentalsData = await res.json();
    
    // Check if data is stale (> 7 days old)
    const generated = new Date(fundamentalsData.generatedAt);
    const ageDays = (Date.now() - generated.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      console.warn(`Fundamentals data is ${ageDays.toFixed(1)} days old. Consider re-fetching.`);
    }
    
    fundamentalsLoaded = true;
    return fundamentalsData;
  } catch (err) {
    console.warn('Could not load fundamentals data, falling back to demo mode:', err.message);
    fundamentalsData = null;
    fundamentalsLoaded = true; // Don't keep retrying
    return null;
  }
}

/**
 * Get real fundamentals for a ticker. Returns the data object or null.
 */
function getFundamentals(ticker) {
  if (!fundamentalsData) return null;
  return fundamentalsData.tickers[ticker] || null;
}

/**
 * Get the data freshness info for display.
 * Returns { date, ageDays, isStale } or null if no data.
 */
function getDataStatus() {
  if (!fundamentalsData) return null;
  const generated = new Date(fundamentalsData.generatedAt);
  const ageDays = (Date.now() - generated.getTime()) / (1000 * 60 * 60 * 24);
  return {
    date: generated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    ageDays: ageDays,
    isStale: ageDays > 3
  };
}

/**
 * Format a number for display.
 */
function fmtB(n) {
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return n.toFixed(0);
}

function fmtPct(n, decimals = 1) {
  if (n == null) return '--';
  return (n * 100).toFixed(decimals) + '%';
}

function fmtNum(n, decimals = 2) {
  if (n == null) return '--';
  return n.toFixed(decimals);
}

/**
 * Compute a Relative Strength rating (0-100) based on where the current
 * price sits in the 52-week range. This is a simplified proxy for O'Neil's
 * RS rating, which uses a more complex calculation.
 */
function computeRS(price, high52, low52) {
  if (!price || !high52 || !low52 || high52 === low52) return 50;
  const position = (price - low52) / (high52 - low52);
  // Map 0-1 range to 20-99 RS rating
  return Math.round(20 + position * 79);
}

/**
 * Compute a volume trend proxy (0-100) based on price momentum.
 * Real volume trend would need daily volume data; this uses price
 * position in 52-week range as a proxy.
 */
function computeVolumeTrend(price, high52, low52) {
  if (!price || !high52 || !low52) return 50;
  const position = (price - low52) / (high52 - low52);
  return Math.round(20 + position * 70);
}
