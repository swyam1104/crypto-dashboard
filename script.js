// Crypto Dashboard - script.js
// Uses CoinGecko public API (no API key). Chart.js should be loaded via CDN.

const API_BASE = 'https://api.coingecko.com/api/v3';
const VS_CURRENCY = 'usd';

// --- DOM
const coinSelect = document.getElementById('coin-select');
const rangeButtons = document.querySelectorAll('.range-btn');
const fromDateInput = document.getElementById('from-date');
const toDateInput = document.getElementById('to-date');
const applyRangeBtn = document.getElementById('apply-range');
const currentPriceEl = document.getElementById('current-price');
const marketCapEl = document.getElementById('market-cap');
const priceChangeEl = document.getElementById('price-change');
const priceTableBody = document.querySelector('#priceTable tbody');
const themeToggle = document.getElementById('theme-toggle');

let priceChart = null;
let currentCoin = coinSelect.value;

// Utilities
const fmtCurrency = v => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(v);
const fmtDate = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString();
};
const unixSeconds = ms => Math.floor(ms / 1000);

// Load theme from localStorage
function loadTheme(){
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme','dark');
    themeToggle.checked = true;
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggle.checked = false;
  }
}
themeToggle.addEventListener('change', () => {
  if(themeToggle.checked){
    document.documentElement.setAttribute('data-theme','dark');
    localStorage.setItem('theme','dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme','light');
  }
});
loadTheme();

// Fetch current market info (price, market cap, 24h change)
async function fetchCurrent(coinId){
  const url = `${API_BASE}/coins/markets?vs_currency=${VS_CURRENCY}&ids=${encodeURIComponent(coinId)}&order=market_cap_desc&per_page=1&page=1&sparkline=false`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Failed to fetch current market data');
  const data = await res.json();
  return data[0];
}

// Fetch price range (CoinGecko supports range endpoint)
async function fetchRangePrices(coinId, fromSec, toSec){
  const url = `${API_BASE}/coins/${coinId}/market_chart/range?vs_currency=${VS_CURRENCY}&from=${fromSec}&to=${toSec}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Failed to fetch historical prices');
  const data = await res.json();
  // data.prices = [[timestamp(ms), price], ...]
  return data.prices || [];
}

// Update summary cards
function updateSummary(current){
  currentPriceEl.textContent = fmtCurrency(current.current_price);
  marketCapEl.textContent = current.market_cap ? fmtCurrency(current.market_cap) : '—';
  const change = current.price_change_percentage_24h;
  priceChangeEl.textContent = change === null ? '—' : `${change.toFixed(2)}%`;
  priceChangeEl.style.color = change >= 0 ? 'var(--accent)' : 'crimson';
}

// Chart initialization or update
function initOrUpdateChart(labels, prices){
  if(priceChart){
    priceChart.data.labels = labels;
    priceChart.data.datasets[0].data = prices;
    priceChart.update();
    return;
  }
  const ctx = document.getElementById('priceChart').getContext('2d');
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${coinSelect.options[coinSelect.selectedIndex].text} price (USD)`,
        data: prices,
        tension: 0.2,
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {mode: 'index', intersect: false},
      plugins: {
        legend: {display: false},
        tooltip: {callbacks: {label: ctx => `${fmtCurrency(ctx.parsed.y)}`}}
      },
      scales: {
        x: {
          type: 'time',
          time: {unit: 'day', tooltipFormat: 'MMM dd, yyyy'}
        },
        y: {
          ticks: {callback: v => '$' + v}
        }
      }
    }
  });
}

// Build table (simple)
function populateTable(prices){
  priceTableBody.innerHTML = '';
  // Show newest first (reverse)
  const rows = prices.slice().reverse();
  for(const [ts, price] of rows){
    const tr = document.createElement('tr');
    const dtd = document.createElement('td');
    const tdp = document.createElement('td');
    dtd.textContent = new Date(ts).toLocaleString();
    tdp.textContent = fmtCurrency(price);
    tr.appendChild(dtd);
    tr.appendChild(tdp);
    priceTableBody.appendChild(tr);
  }
}

// Main update flow (gets current + range prices and updates UI)
// Simple in-memory cache (resets on page reload)
const cache = new Map();

async function updateDashboard(coinId, fromSec, toSec){
  const cacheKey = `${coinId}-${fromSec}-${toSec}`;
  
  try {
    // ✅ Use cache if available
    if (cache.has(cacheKey)) {
      console.log("Using cached data:", cacheKey);
      const prices = cache.get(cacheKey);
      renderDashboard(prices, coinId);
      return;
    }

    // show loading
    currentPriceEl.textContent = 'Loading…';
    marketCapEl.textContent = '—';
    priceChangeEl.textContent = '—';

    // ✅ Fetch only the price history (1 API call)
    const prices = await fetchRangePrices(coinId, fromSec, toSec);

    // save to cache
    cache.set(cacheKey, prices);

    // render everything
    renderDashboard(prices, coinId);

  } catch (err) {
    console.error("Dashboard error:", err);
    alert('Failed to load data: ' + (err.message || err));
  }
}

// Render summary + chart + table
function renderDashboard(prices, coinId) {
  if (!prices || prices.length === 0) {
    alert("No data available for this range.");
    return;
  }

  // last point = "current"
  const [lastTs, lastPrice] = prices[prices.length - 1];
  const [prevTs, prevPrice] = prices[prices.length - 2] || [null, lastPrice];
  const pctChange = prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0;

  updateSummary({
    current_price: lastPrice,
    market_cap: null, // not fetched to save calls
    price_change_percentage_24h: pctChange
  });

  // chart
  const labels = prices.map(p => new Date(p[0]));
  const data = prices.map(p => Number(p[1].toFixed(6)));
  initOrUpdateChart(labels, data);

  // table
  populateTable(prices);
}


// Helpers to compute from/to
function rangeToUnix(days){
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  return {fromSec: unixSeconds(from), toSec: unixSeconds(to)};
}

// Default: initial load 30 days
function initialLoad(){
  const days = 30;
  const {fromSec, toSec} = rangeToUnix(days);
  // set UI pressed state
  document.querySelectorAll('.range-btn').forEach(b => b.setAttribute('aria-pressed','false'));
  document.querySelector('.range-btn[data-days="30"]').setAttribute('aria-pressed','true');
  updateDashboard(currentCoin, fromSec, toSec);
}
initialLoad();

// Event listeners
coinSelect.addEventListener('change', (e) => {
  currentCoin = e.target.value;
  // reload default 30d on coin change
  const {fromSec, toSec} = rangeToUnix(30);
  updateDashboard(currentCoin, fromSec, toSec);
});

// quick ranges
rangeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    rangeButtons.forEach(b => b.setAttribute('aria-pressed','false'));
    btn.setAttribute('aria-pressed','true');
    const days = Number(btn.dataset.days);
    const {fromSec, toSec} = rangeToUnix(days);
    updateDashboard(currentCoin, fromSec, toSec);
  });
});

// custom date range
applyRangeBtn.addEventListener('click', () => {
  const fromVal = fromDateInput.value;
  const toVal = toDateInput.value;
  if(!fromVal || !toVal){
    alert('Please pick both from and to dates.');
    return;
  }
  const from = new Date(fromVal);
  const to = new Date(toVal);
  if(from > to) { alert('"From" must be before "To"'); return; }

  const fromSec = unixSeconds(from.getTime());
  // Add time to 'to' so the day is included (set end of day)
  to.setHours(23,59,59,999);
  const toSec = unixSeconds(to.getTime());

  // cancel pressed state
  rangeButtons.forEach(b => b.setAttribute('aria-pressed','false'));
  updateDashboard(currentCoin, fromSec, toSec);
});

// keyboard accessibility: allow Enter on range buttons
document.querySelectorAll('.range-btn').forEach(b => {
  b.setAttribute('tabindex','0');
  b.addEventListener('keydown', e => { if(e.key === 'Enter') b.click(); });
});

// small debounce utility if you add text inputs later
function debounce(fn, wait=250){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}
