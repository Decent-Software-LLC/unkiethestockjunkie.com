/**
 * Fundamentals data loader for Unkie The Stock Junkie screeners.
 * Loads real market data from assets/data/fundamentals.json (updated daily
 * by GitHub Action after market close). Falls back to demo mode if data
 * is missing or stale.
 */

let fundamentalsData = null;
let fundamentalsLoaded = false;

/**
 * Resolve a path under the site root.
 *
 * Was hardcoded as '/assets/...', which only works while the site is served from the
 * domain root. Under a project URL (kjw3.github.io/unkiethestockjunkie.com/) or any
 * non-empty Jekyll baseurl, that resolves to the wrong origin path and every screener
 * silently drops to demo mode - fabricated fundamentals presented as real data.
 *
 * Reads the base from <html data-site-base="..."> when the layout provides it, so the
 * single source of truth stays in Liquid's relative_url. Falls back to document.baseURI
 * rather than '/' so the loader still resolves correctly when opened outside Jekyll.
 */
function siteAssetUrl(relativePath) {
  const clean = relativePath.replace(/^\/+/, '');
  const el = document.documentElement;
  const base = el && el.getAttribute('data-site-base');
  if (base !== null) {
    // relative_url emits '' at the root and '/subdir' otherwise; normalise both to
    // a form that joins cleanly with the asset path.
    return base === '' ? `/${clean}` : `${base.replace(/\/+$/, '')}/${clean}`;
  }
  return new URL(`assets/${clean}`, document.baseURI).href;
}

/**
 * Load fundamentals JSON. Returns a promise that resolves when done.
 * Safe to call multiple times — only loads once.
 */
async function loadFundamentals() {
  if (fundamentalsLoaded) return fundamentalsData;
  
  try {
    const res = await fetch(siteAssetUrl('assets/data/fundamentals.json'), { cache: 'no-cache' });
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
 * The one line that tells a reader whether the figures above them are trustworthy right now.
 *
 * The accessor below already computed isStale, but no page rendered it: stale files kept claiming
 * "Real data" and a weekend-old or holiday-old snapshot was indistinguishable from tonight's. Age is
 * now stated in words in the same element that announces the data source, because a number nobody can
 * date is a number nobody should repeat.
 */
function realDataLabel(status) {
  if (!status) return '\u{1F4CA} No date attached to this data \u2014 treat every figure as unverified';
  if (status.isStale) {
    const days = Math.max(1, Math.round(status.ageDays));
    return '\u26A0\uFE0F Data dated ' + status.date + ' \u2014 about ' + days +
      ' day' + (days === 1 ? '' : 's') + ' old, so verify before quoting any of it';
  }
  return '\u{1F4CA} Data dated ' + status.date + ', refreshed after the last market close';
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
