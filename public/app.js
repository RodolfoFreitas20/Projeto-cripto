const $ = sel => document.querySelector(sel);
const coinsContainer = $('#coins-container');
const stocksContainer = $('#stocks-container');
const sizeModeSelect = $('#size-mode');

function fmtNumber(n){
  if(n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR');
}

function renderCoins(items){
  if(!Array.isArray(items) || items.length === 0){
    coinsContainer.innerHTML = '<div class="legend">Nenhuma moeda encontrada.</div>';
    return;
  }

  const mode = sizeModeSelect.value;
  const values = items
    .map(it => {
      const marketCap = Number(it.market_cap ?? 0) || 0;
      const change = Math.abs(Number(it.price_change_percentage_24h ?? it.price_change_24h ?? 0) || 0);
      return mode === 'market_cap' ? marketCap : change;
    })
    .filter(v => v > 0);

  const min = Math.min(...values) || 0;
  const max = Math.max(...values) || 1;

  const scale = v => {
    if(v <= 0) return 38;
    const ratio = (Math.sqrt(v) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min) || 1);
    return Math.round(36 + ratio * 84);
  };

  coinsContainer.innerHTML = '';
  items.forEach(it => {
    const price = it.current_price ?? it.price ?? it.value;
    const change = Number(it.price_change_percentage_24h ?? it.price_change_24h ?? 0) || 0;
    const marketCap = Number(it.market_cap ?? it.market_cap_usd ?? 0) || 0;
    const sizeValue = mode === 'market_cap' ? marketCap : Math.abs(change);
    const size = scale(sizeValue);

    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.background = change >= 0 ? '#16a34a' : '#ef4444';
    el.title = `${it.name || it.symbol || it.id}\nPreço: ${fmtNumber(price)}\nVariação 24h: ${change.toFixed(2)}%\nValor mercado: ${fmtNumber(marketCap)}`;

    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<div>${(it.symbol || it.id || '').toUpperCase()}</div><div>${fmtNumber(price)}</div>`;
    el.appendChild(label);
    coinsContainer.appendChild(el);
  });
}

function renderStocks(items){
  const rows = Array.isArray(items)
    ? items
    : (items && Array.isArray(items.data)
        ? items.data
        : (items && Array.isArray(items.results)
            ? items.results
            : []));

  if(rows.length === 0){
    stocksContainer.innerHTML = '<div class="legend">Nenhuma ação encontrada.</div>';
    return;
  }

  const list = rows.slice(0, 20);
  const table = document.createElement('table');
  table.className = 'stocks-table';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Ticker</th><th>Nome</th><th>Preço</th><th>Variação</th><th>Valor de mercado</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  list.forEach(it => {
    const symbol = it.ticker ?? it.symbol ?? it.code ?? it.id ?? '';
    const name = it.shortName ?? it.companyName ?? it.name ?? '';
    const price = it.regularMarketPrice ?? it.price ?? it.lastPrice ?? it.regularMarketLastPrice ?? null;
    const change = Number(it.regularMarketChangePercent ?? it.change_percent ?? it.change_pct ?? it.change ?? 0) || 0;
    const marketCap = it.marketCap ?? it.market_cap ?? it.market_cap_usd ?? it.market_cap_value ?? it.marketCapitalization ?? null;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${symbol}</strong></td>
      <td>${name || '-'}</td>
      <td>R$ ${price != null ? Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
      <td class="${change >= 0 ? 'change-pos' : 'change-neg'}">${change.toFixed(2)}%</td>
      <td>${marketCap != null ? 'R$ ' + Number(marketCap).toLocaleString('pt-BR') : '-'}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  stocksContainer.innerHTML = '';
  stocksContainer.appendChild(table);
}

async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadCoins(){
  coinsContainer.textContent = 'Carregando...';
  try {
    const data = await fetchJson('/api/coins');
    renderCoins(Array.isArray(data) ? data : (data.coins || data.markets || []));
  } catch (err) {
    coinsContainer.innerHTML = `<div class="legend">Erro ao carregar: ${err.message}</div>`;
  }
}

async function loadStocks(){
  stocksContainer.textContent = 'Carregando...';
  try {
    const data = await fetchJson('/api/stocks');
    renderStocks(data);
  } catch (err) {
    stocksContainer.innerHTML = `<div class="legend">Erro ao carregar: ${err.message}</div>`;
  }
}

$('#tab-coins').addEventListener('click', () => {
  $('#tab-coins').classList.add('active');
  $('#tab-stocks').classList.remove('active');
  $('#tab-coins').setAttribute('aria-selected', 'true');
  $('#tab-stocks').setAttribute('aria-selected', 'false');
  $('#panel-coins').hidden = false;
  $('#panel-stocks').hidden = true;
});

$('#tab-stocks').addEventListener('click', () => {
  $('#tab-stocks').classList.add('active');
  $('#tab-coins').classList.remove('active');
  $('#tab-stocks').setAttribute('aria-selected', 'true');
  $('#tab-coins').setAttribute('aria-selected', 'false');
  $('#panel-stocks').hidden = false;
  $('#panel-coins').hidden = true;
});

$('#refresh-coins').addEventListener('click', loadCoins);
$('#refresh-stocks').addEventListener('click', loadStocks);
sizeModeSelect.addEventListener('change', loadCoins);

loadCoins();
loadStocks();
