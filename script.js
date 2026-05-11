const API_KEY = 'PE2PS8DW2PUUICW5';

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

  // ── Helpers ──────────────────────────────────────────────

  function checkForApiError(data) {
    if (data['Note']) {
      throw new Error('RATE_LIMIT');
    }
    if (data['Information']) {
      throw new Error('RATE_LIMIT');
    }
    if (data['Error Message']) {
      throw new Error('INVALID_SYMBOL');
    }
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

  // ── Fetch Functions ───────────────────────────────────────

  function fetchStockData(symbol) {
    setPlaceholders();
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('NETWORK');
        return res.json();
      })
      .then(data => {
        checkForApiError(data);
        if (!data.Symbol) throw new Error('INVALID_SYMBOL');
        updateStockInfo(data);
        fetchStockPrice(symbol);
        fetchNews(symbol);
        fetchFinancials(symbol);
      })
      .catch(err => {
        console.error('Overview error:', err.message);
        showError(err.message);
      });
  }

  function fetchStockPrice(symbol) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        const series = data['Time Series (Daily)'];
        if (!series) return;

        const dates = Object.keys(series).slice(0, 30).reverse();
        const prices = dates.map(date => parseFloat(series[date]['4. close']));

        const latest = prices[prices.length - 1];
        const prev = prices[prices.length - 2];
        const change = latest - prev;
        const changePct = ((change / prev) * 100).toFixed(2);
        const changeColor = change >= 0 ? '#44bd32' : '#e84118';
        const changeSign = change >= 0 ? '+' : '';

        document.getElementById('current-price').textContent = `$${latest.toFixed(2)}`;
        const priceChangeEl = document.getElementById('price-change');
        priceChangeEl.textContent = `Change: ${changeSign}${change.toFixed(2)} (${changeSign}${changePct}%)`;
        priceChangeEl.style.color = changeColor;

        // Also fill in day range from the most recent day
        const latestDay = Object.keys(series)[0];
        const high = parseFloat(series[latestDay]['2. high']).toFixed(2);
        const low = parseFloat(series[latestDay]['3. low']).toFixed(2);
        document.getElementById('day-range').textContent = `$${low} - $${high}`;

        renderPriceChart(dates.slice(-30), prices.slice(-30));
      })
      .catch(err => console.error('Price fetch error:', err.message));
  }

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
          const sentimentColor = sentiment.toLowerCase().includes('bullish') ? 'green'
            : sentiment.toLowerCase().includes('bearish') ? 'red' : '#718093';
          li.innerHTML = `
            <a href="${article.url}" target="_blank">${article.title}</a>
            ${sentiment ? `<span style="font-size:0.8rem;color:${sentimentColor};margin-left:8px;">[${sentiment}]</span>` : ''}
          `;
          newsList.appendChild(li);
        });
      })
      .catch(err => {
        console.error('News fetch error:', err.message);
        newsList.innerHTML = '<li>Could not fetch news.</li>';
      });
  }

  function fetchFinancials(symbol) {
    const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        checkForApiError(data);
        balanceData = data;
        displayFinancials('annualReports');
      })
      .catch(err => console.error('Financials fetch error:', err.message));
  }

  // ── Display & Chart Functions ─────────────────────────────

  function updateStockInfo(data) {
    const pe = parseFloat(data.PERatio);
    const peStatus = getPERating(pe);

    document.getElementById('previous-close').textContent = data.PreviousClose || 'N/A';
    document.getElementById('open-price').textContent = data.Open || 'N/A';
    document.getElementById('week-range').textContent =
      data['52WeekLow'] && data['52WeekHigh']
        ? `$${data['52WeekLow']} - $${data['52WeekHigh']}`
        : 'N/A';
    document.getElementById('volume').textContent = data.Volume
      ? parseInt(data.Volume).toLocaleString()
      : 'N/A';
    document.getElementById('market-cap').textContent = data.MarketCapitalization
      ? `$${(parseInt(data.MarketCapitalization) / 1_000_000_000).toFixed(2)}B`
      : 'N/A';
    document.getElementById('pe-ratio').innerHTML = data.PERatio && data.PERatio !== 'None'
      ? `${data.PERatio} <span style="font-weight:bold;color:${peStatus.color};">(${peStatus.label})</span>`
      : 'N/A';
  }

  function getPERating(pe) {
    if (isNaN(pe)) return { label: 'N/A', color: 'gray' };
    if (pe < 15) return { label: 'Good', color: 'green' };
    if (pe <= 25) return { label: 'Average', color: 'orange' };
    return { label: 'High', color: 'red' };
  }

  function renderPriceChart(labels, prices) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
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
      options: {
        responsive: true,
        scales: { y: { beginAtZero: false } }
      }
    });
  }

  function displayFinancials(type) {
    if (!balanceData || !balanceData[type]) return;

    const reports = balanceData[type].slice(0, 10).reverse();
    const latest = reports[reports.length - 1];

    document.getElementById('assets').textContent = formatNumber(latest.totalAssets);
    document.getElementById('liabilities').textContent = formatNumber(latest.totalLiabilities);
    document.getElementById('equity').textContent = formatNumber(latest.totalShareholderEquity);

    const labels = reports.map(r => r.fiscalDateEnding);
    const assets = reports.map(r => parseInt(r.totalAssets));
    const liabilities = reports.map(r => parseInt(r.totalLiabilities));
    const equity = reports.map(r => parseInt(r.totalShareholderEquity));

    renderFinancialChart(labels, assets, liabilities, equity, type === 'annualReports');
  }

  function renderFinancialChart(labels, assets, liabilities, equity, isAnnual) {
    const ctx = document.getElementById('financialChart').getContext('2d');
    if (financialChart) financialChart.destroy();

    financialChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Total Assets', data: assets, backgroundColor: 'rgba(46, 204, 113, 0.6)' },
          { label: 'Total Liabilities', data: liabilities, backgroundColor: 'rgba(231, 76, 60, 0.6)' },
          { label: 'Shareholder Equity', data: equity, backgroundColor: 'rgba(52, 152, 219, 0.6)' }
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
            ticks: {
              callback: value => '$' + (value / 1_000_000_000).toFixed(1) + 'B'
            },
            beginAtZero: true
          }
        }
      }
    });
  }

  function formatNumber(num) {
    if (!num || num === 'None') return 'N/A';
    const n = parseInt(num);
    if (isNaN(n)) return 'N/A';
    return `$${(n / 1_000_000_000).toFixed(2)}B`;
  }
});