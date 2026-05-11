const API_KEY = '%%API_KEY%%';

document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('search-btn');
  const stockInput = document.getElementById('stock-input');
  const newsList = document.getElementById('news-list');
  let chartInstance = null;
  let financialChart = null;
  let currentSymbol = 'AAPL';
  let balanceData = null;

  const annualBtn = document.getElementById('annual-btn');
  const quarterlyBtn = document.getElementById('quarterly-btn');

  fetchStockData(currentSymbol);

  searchBtn.addEventListener('click', () => {
    const symbol = stockInput.value.trim().toUpperCase();
    if (symbol) {
      currentSymbol = symbol;
      fetchStockData(symbol);
    }
  });

  stockInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });

  annualBtn.addEventListener('click', () => {
    annualBtn.classList.add('active');
    quarterlyBtn.classList.remove('active');
    displayFinancials('annualReports');
  });

  quarterlyBtn.addEventListener('click', () => {
    quarterlyBtn.classList.add('active');
    annualBtn.classList.remove('active');
    displayFinancials('quarterlyReports');
  });

  // ── Helpers ───────────────────────────────────────────────

  function checkForApiError(data) {
    if (data['Note'] || data['Information']) throw new Error('RATE_LIMIT');
    if (data['Error Message']) throw new Error('INVALID_SYMBOL');
  }

  function showError(type) {
    if (type === 'RATE_LIMIT') {
      alert('API rate limit reached (25 requests/day on the free plan). Please wait until tomorrow or use a different API key.');
    } else if (type === 'INVALID_SYMBOL') {
      alert('Invalid stock symbol. Please try again.');
    } else {
      alert('Could not fetch data. Check your connection and try again.');
    }
  }

  function setPlaceholders() {
    document.getElementById('current-price').textContent = '$---';
    document.getElementById('price-change').textContent = 'Change: --';
    document.getElementById('previous-close').textContent = '--';
    document.getElementById('open-price').textContent = '--';
    document.getElementById('day-range').textContent = '--';
    document.getElementById('week-range').textContent = '--';
    document.getElementById('volume').textContent = '--';
    document.getElementById('market-cap').textContent = '--';
    document.getElementById('pe-ratio').textContent = '--';
    document.getElementById('assets').textContent = '--';
    document.getElementById('liabilities').textContent = '--';
    document.getElementById('equity').textContent = '--';
    newsList.innerHTML = '';
  }

  function fmtBillions(num) {
    if (!num || num === 'None' || num === '-') return 'N/A';
    const n = parseFloat(num);
    if (isNaN(n)) return 'N/A';
    return `$${(n / 1_000_000_000).toFixed(2)}B`;
  }

  // ── Main fetch ────────────────────────────────────────────

  function fetchStockData(symbol) {
    setPlaceholders();

    // OVERVIEW: fundamentals — MarketCap, PE ratio, 52-week range
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(overviewUrl)
      .then(res => { if (!res.ok) throw new Error('NETWORK'); return res.json(); })
      .then(data => {
        checkForApiError(data);
        if (!data.Symbol) throw new Error('INVALID_SYMBOL');
        updateOverviewFields(data);
        fetchGlobalQuote(symbol);
        fetchPriceChart(symbol);
        fetchNews(symbol);
        fetchFinancials(symbol);
      })
      .catch(err => {
        console.error('Overview error:', err.message);
        showError(err.message);
      });
  }

  // GLOBAL_QUOTE: current price, open, high, low, prev close, volume, change
  // This is the correct endpoint for live quote data — OVERVIEW does NOT have these fields
  function fetchGlobalQuote(symbol) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        const q = data['Global Quote'];
        if (!q || !q['05. price']) return;

        const price     = parseFloat(q['05. price']).toFixed(2);
        const open      = parseFloat(q['02. open']).toFixed(2);
        const high      = parseFloat(q['03. high']).toFixed(2);
        const low       = parseFloat(q['04. low']).toFixed(2);
        const prevClose = parseFloat(q['08. previous close']).toFixed(2);
        const volume    = parseInt(q['06. volume']).toLocaleString();
        const change    = parseFloat(q['09. change']).toFixed(2);
        const changePct = q['10. change percent'] || '';
        const changeNum = parseFloat(change);

        document.getElementById('current-price').textContent  = `$${price}`;
        document.getElementById('previous-close').textContent = `$${prevClose}`;
        document.getElementById('open-price').textContent     = `$${open}`;
        document.getElementById('day-range').textContent      = `$${low} - $${high}`;
        document.getElementById('volume').textContent         = volume;

        const changeEl = document.getElementById('price-change');
        const sign = changeNum >= 0 ? '+' : '';
        changeEl.textContent = `Change: ${sign}${change} (${changePct})`;
        changeEl.style.color = changeNum >= 0 ? '#44bd32' : '#e84118';
      })
      .catch(err => console.error('Global quote error:', err.message));
  }

  // TIME_SERIES_DAILY: historical closes for the price chart
  function fetchPriceChart(symbol) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        const series = data['Time Series (Daily)'];
        if (!series) return;
        const dates  = Object.keys(series).slice(0, 30).reverse();
        const prices = dates.map(d => parseFloat(series[d]['4. close']));
        renderPriceChart(dates, prices);
      })
      .catch(err => console.error('Chart error:', err.message));
  }

  // OVERVIEW fields — only what this endpoint actually returns
  function updateOverviewFields(data) {
    const pe = parseFloat(data.PERatio);
    const peStatus = getPERating(pe);

    document.getElementById('week-range').textContent =
      data['52WeekLow'] && data['52WeekHigh'] && data['52WeekLow'] !== 'None'
        ? `$${data['52WeekLow']} - $${data['52WeekHigh']}`
        : 'N/A';

    document.getElementById('market-cap').textContent = fmtBillions(data.MarketCapitalization);

    document.getElementById('pe-ratio').innerHTML =
      data.PERatio && data.PERatio !== 'None'
        ? `${data.PERatio} <span style="font-weight:bold;color:${peStatus.color};">(${peStatus.label})</span>`
        : 'N/A';
  }

  function getPERating(pe) {
    if (isNaN(pe)) return { label: 'N/A', color: 'gray' };
    if (pe < 15)   return { label: 'Good', color: 'green' };
    if (pe <= 25)  return { label: 'Average', color: 'orange' };
    return { label: 'High', color: 'red' };
  }

  // ── Charts ────────────────────────────────────────────────

  function renderPriceChart(labels, prices) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Closing Price (Last 30 Days)',
          data: prices,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.15)',
          tension: 0.3,
          pointRadius: 2,
          fill: true
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: false } } }
    });
  }

  function renderFinancialChart(labels, assets, liabilities, equity, isAnnual) {
    const ctx = document.getElementById('financialChart').getContext('2d');
    if (financialChart) financialChart.destroy();
    financialChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Total Assets',       data: assets,      backgroundColor: 'rgba(46, 204, 113, 0.6)' },
          { label: 'Total Liabilities',  data: liabilities, backgroundColor: 'rgba(231, 76, 60, 0.6)'  },
          { label: 'Shareholder Equity', data: equity,      backgroundColor: 'rgba(52, 152, 219, 0.6)' }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: isAnnual ? 'Balance Sheet (Last 10 Years)' : 'Balance Sheet (Last 10 Quarters)',
            font: { size: 16 }
          },
          legend: { position: 'top' }
        },
        scales: {
          y: {
            ticks: { callback: v => '$' + (v / 1_000_000_000).toFixed(1) + 'B' },
            beginAtZero: true
          }
        }
      }
    });
  }

  // ── News ──────────────────────────────────────────────────

  function fetchNews(symbol) {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        const articles = data.feed ? data.feed.slice(0, 5) : [];
        newsList.innerHTML = '';
        if (articles.length === 0) {
          newsList.innerHTML = '<li>No recent news available.</li>';
          return;
        }
        articles.forEach(article => {
          const li = document.createElement('li');
          const sentiment = article.overall_sentiment_label || '';
          const color = sentiment.toLowerCase().includes('bullish') ? 'green'
                      : sentiment.toLowerCase().includes('bearish') ? 'red'
                      : '#718093';
          li.innerHTML = `<a href="${article.url}" target="_blank">${article.title}</a>
            ${sentiment ? `<span style="font-size:0.8rem;color:${color};margin-left:8px;">[${sentiment}]</span>` : ''}`;
          newsList.appendChild(li);
        });
      })
      .catch(err => {
        console.error('News error:', err.message);
        newsList.innerHTML = '<li>Could not fetch news.</li>';
      });
  }

  // ── Financials ────────────────────────────────────────────

  function fetchFinancials(symbol) {
    const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        balanceData = data;
        displayFinancials('annualReports');
      })
      .catch(err => console.error('Financials error:', err.message));
  }

  function displayFinancials(type) {
    if (!balanceData || !balanceData[type] || balanceData[type].length === 0) return;

    const reports     = balanceData[type].slice(0, 10).reverse();
    const latest      = reports[reports.length - 1];

    document.getElementById('assets').textContent      = fmtBillions(latest.totalAssets);
    document.getElementById('liabilities').textContent = fmtBillions(latest.totalLiabilities);
    document.getElementById('equity').textContent      = fmtBillions(latest.totalShareholderEquity);

    const labels      = reports.map(r => r.fiscalDateEnding);
    const assets      = reports.map(r => parseInt(r.totalAssets)            || 0);
    const liabilities = reports.map(r => parseInt(r.totalLiabilities)       || 0);
    const equity      = reports.map(r => parseInt(r.totalShareholderEquity) || 0);

    renderFinancialChart(labels, assets, liabilities, equity, type === 'annualReports');
  }
});