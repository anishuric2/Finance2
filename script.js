const API_KEY = 'AYALD4G0AZSXUQE9'; // Replace with your Alpha Vantage API key

document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('search-btn');
  const stockInput = document.getElementById('stock-input');
  const newsList = document.getElementById('news-list');
  let chartInstance = null;
  let financialChart = null;
  let currentSymbol = 'AAPL';
  let balanceData = null;

  // Toggle buttons
  const annualBtn = document.getElementById('annual-btn');
  const quarterlyBtn = document.getElementById('quarterly-btn');

  // Default load
  fetchStockData(currentSymbol);

  searchBtn.addEventListener('click', () => {
    const symbol = stockInput.value.trim().toUpperCase();
    if (symbol) {
      currentSymbol = symbol;
      fetchStockData(symbol);
    }
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

  function fetchStockData(symbol) {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch stock data');
        return response.json();
      })
      .then(data => {
        if (!data.Symbol) throw new Error('Invalid symbol or data unavailable.');
        updateStockInfo(data);
        fetchStockPrice(symbol);
        fetchNews(symbol);
        fetchFinancials(symbol);
      })
      .catch(error => {
        console.error('Error fetching stock data:', error);
        alert('Could not fetch data for that symbol. Try again.');
      });
  }

  function fetchStockPrice(symbol) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const series = data['Time Series (Daily)'];
        if (!series) return;

        const dates = Object.keys(series).slice(0, 5).reverse();
        const prices = dates.map(date => parseFloat(series[date]['4. close']));
        renderPriceChart(dates, prices);
        document.getElementById('current-price').textContent = `$${prices[prices.length - 1].toFixed(2)}`;
      })
      .catch(err => console.error('Error fetching stock prices:', err));
  }

  function updateStockInfo(data) {
    const pe = parseFloat(data.PERatio);
    const peStatus = getPERating(pe);

    document.getElementById('previous-close').textContent = data.PreviousClose || 'N/A';
    document.getElementById('open-price').textContent = data.Open || 'N/A';
    document.getElementById('day-range').textContent = 'N/A';
    document.getElementById('week-range').textContent = `${data['52WeekLow']} - ${data['52WeekHigh']}`;
    document.getElementById('volume').textContent = data.Volume || 'N/A';
    document.getElementById('market-cap').textContent = data.MarketCapitalization || 'N/A';
    document.getElementById('pe-ratio').innerHTML = data.PERatio
      ? `${data.PERatio} <span style="font-weight:bold;color:${peStatus.color};">(${peStatus.label})</span>`
      : 'N/A';
    document.getElementById('price-change').textContent = `Change: N/A`;
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
          label: 'Closing Price (Last 5 Days)',
          data: prices,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.2)',
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: false } }
      }
    });
  }

  function fetchNews(symbol) {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const articles = data.feed ? data.feed.slice(0, 3) : [];
        newsList.innerHTML = '';

        if (articles.length === 0) {
          newsList.innerHTML = '<li>No recent news available.</li>';
          return;
        }

        articles.forEach(article => {
          const li = document.createElement('li');
          li.innerHTML = `<a href="${article.url}" target="_blank">${article.title}</a>`;
          newsList.appendChild(li);
        });
      })
      .catch(err => {
        console.error('Error fetching news:', err);
        newsList.innerHTML = '<li>Could not fetch news.</li>';
      });
  }

  function fetchFinancials(symbol) {
    const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${API_KEY}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        balanceData = data;
        displayFinancials('annualReports');
      })
      .catch(err => console.error('Error fetching financials:', err));
  }

  function displayFinancials(type) {
    if (!balanceData || !balanceData[type]) return;

    const reports = balanceData[type].slice(0, 10).reverse();
    const latest = reports[reports.length - 1];

    // Update latest values
    document.getElementById('assets').textContent = formatNumber(latest.totalAssets);
    document.getElementById('liabilities').textContent = formatNumber(latest.totalLiabilities);
    document.getElementById('equity').textContent = formatNumber(latest.totalShareholderEquity);

    // Prepare chart data
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
          {
            label: 'Total Assets',
            data: assets,
            backgroundColor: 'rgba(46, 204, 113, 0.6)'
          },
          {
            label: 'Total Liabilities',
            data: liabilities,
            backgroundColor: 'rgba(231, 76, 60, 0.6)'
          },
          {
            label: 'Shareholder Equity',
            data: equity,
            backgroundColor: 'rgba(52, 152, 219, 0.6)'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: isAnnual
              ? 'Balance Sheet (Last 10 Years)'
              : 'Balance Sheet (Last 10 Quarters)',
            font: { size: 16 }
          },
          legend: { position: 'top' }
        },
        scales: {
          y: {
            ticks: {
              callback: function (value) {
                return '$' + (value / 1_000_000_000).toFixed(1) + 'B';
              }
            },
            beginAtZero: true
          }
        }
      }
    });
  }

  function formatNumber(num) {
    if (!num) return 'N/A';
    const n = parseInt(num);
    if (isNaN(n)) return 'N/A';
    return `$${(n / 1_000_000_000).toFixed(2)}B`;
  }
});