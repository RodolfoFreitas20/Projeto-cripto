/* ---------- utilidades ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const logos = new Map();
const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 });
const pct = (n) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`;
const big = (n) => n == null ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const cls = (n) => (n ?? 0) >= 0 ? 'up' : 'down';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeImg = (u) => /^https:\/\/((coin-images|assets)\.(coingecko|geckoterminal)\.com|icons\.brapi\.dev)\//.test(u || '') ? u : '';

function logo(url) {
  const u = safeImg(url);
  if (!u) return null;
  if (!logos.has(u)) { const im = new Image(); im.src = u; logos.set(u, im); }
  const im = logos.get(u);
  return im.complete && im.naturalWidth ? im : null;
}

function bindGroup(attr, cb) {
  const btns = document.querySelectorAll(`[data-${attr}]`);
  btns.forEach((btn) => btn.addEventListener('click', () => {
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    cb(btn.dataset[attr]);
  }));
}

/* ---------- links de corretoras (links.json) ---------- */
let LINKS = { padrao: { cripto: [], acoes: [] }, ativos: {} };
fetch('/api/links').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) LINKS = d; }).catch(() => {});

const linksFor = (symbol, kind) => LINKS.ativos[String(symbol).toUpperCase()] ?? LINKS.padrao[kind] ?? [];

// Nome do ativo clicável quando há link de indicação (usa o primeiro da lista)
function nameHtml(text, symbol, kind) {
  const l = linksFor(symbol, kind)[0];
  return l ? `<a class="name-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer sponsored">${esc(text)} ↗</a>` : esc(text);
}

function linksHtml(symbol, kind) {
  const list = linksFor(symbol, kind);
  if (!list.length) return '';
  return `<div class="broker">
    ${list.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer sponsored">${esc(l.nome)} ↗</a>`).join('')}
    <small>Links de indicação: o site pode receber uma comissão se você abrir conta ou negociar.</small></div>`;
}

/* ---------- motor de bolhas (usado por criptomoedas e ações) ---------- */
// item: { id, symbol, image, change (%), cap }
function createChart(canvas, { onSelect }) {
  const ctx = canvas.getContext('2d');
  const bubbles = new Map();
  let W = 0, H = 0, items = [], sizeBy = 'change', selected = null, visible = true, last = performance.now();

  const weight = (it) => sizeBy === 'cap'
    ? Math.sqrt(Math.sqrt(it.cap || 1)) // suaviza diferenças enormes
    : Math.sqrt(Math.max(Math.abs(it.change ?? 0), 0.4));

  function retarget() {
    if (!W || !H) return;
    const minR = W < 520 ? 23 : 26, maxR = Math.min(W, H) * 0.3;
    const ws = items.map(weight);
    const sum = ws.reduce((s, w) => s + w * w, 0) || 1;
    const k = Math.sqrt((0.38 * W * H) / (Math.PI * sum));
    let radii = ws.map((w) => Math.min(Math.max(w * k, minR), maxR));
    const area = radii.reduce((s, r) => s + Math.PI * r * r, 0), limit = 0.6 * W * H;
    if (area > limit) { const f = Math.sqrt(limit / area); radii = radii.map((r) => Math.max(r * f, 16)); } // telas pequenas
    const ids = new Set();
    items.forEach((it, i) => {
      ids.add(it.id);
      let b = bubbles.get(it.id);
      if (!b) {
        b = { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08, r: 8 };
        bubbles.set(it.id, b);
      }
      b.item = it; b.target = radii[i];
    });
    for (const id of bubbles.keys()) if (!ids.has(id)) bubbles.delete(id);
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    retarget();
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function step(dt) {
    const list = [...bubbles.values()];
    for (const b of list) {
      b.r += (b.target - b.r) * Math.min(1, dt * 0.008);
      if (reduceMotion) continue;
      b.vx += (W / 2 - b.x) * 0.0000025 * dt; b.vy += (H / 2 - b.y) * 0.0000025 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= 0.999; b.vy *= 0.999;
      if (Math.hypot(b.vx, b.vy) < 0.015) { const a = Math.random() * 6.283; b.vx += Math.cos(a) * 0.004; b.vy += Math.sin(a) * 0.004; }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 2;
        if (d >= min) continue;
        const nx = dx / d, ny = dy / d, m1 = a.r * a.r, m2 = b.r * b.r, push = (min - d) / (m1 + m2);
        a.x -= nx * push * m2; a.y -= ny * push * m2; b.x += nx * push * m1; b.y += ny * push * m1;
        if (reduceMotion) continue;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = (-1.9 * rv) / (1 / m1 + 1 / m2);
          a.vx -= (j2 * nx) / m1; a.vy -= (j2 * ny) / m1; b.vx += (j2 * nx) / m2; b.vy += (j2 * ny) / m2;
        }
      }
    }
    for (const b of list) {
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
    }
  }

  const font = (w, px) => `${w} ${px}px "Bricolage Grotesque", sans-serif`;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    for (const b of bubbles.values()) {
      const it = b.item, ch = it.change, isSel = selected === it.id;
      const rgb = (ch ?? 0) >= 0 ? '53,214,160' : '255,111,89', mag = Math.min(Math.abs(ch ?? 0) / 10, 1);
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(${rgb},${0.28 + 0.4 * mag})`); g.addColorStop(1, `rgba(${rgb},${0.14 + 0.3 * mag})`);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = isSel ? 4 : 2; ctx.strokeStyle = isSel ? '#f4c95d' : `rgba(${rgb},0.9)`; ctx.stroke();

      ctx.fillStyle = '#e8f1ee';
      if (b.r >= 34) {
        const im = logo(it.image), s = b.r * 0.5;
        if (im) ctx.drawImage(im, b.x - s / 2, b.y - b.r * 0.62, s, s);
        let px = Math.max(11, b.r * 0.27);
        ctx.font = font(700, px);
        while (ctx.measureText(it.symbol).width > b.r * 1.75 && px > 8) { px -= 1; ctx.font = font(700, px); }
        ctx.fillText(it.symbol, b.x, b.y + b.r * 0.2);
        ctx.font = font(400, Math.max(10, b.r * 0.2));
        ctx.fillText(pct(ch), b.x, b.y + b.r * 0.2 + Math.max(13, b.r * 0.24));
      } else {
        let px = 10;
        ctx.font = font(700, px);
        while (ctx.measureText(it.symbol).width > b.r * 1.7 && px > 7) { px -= 0.5; ctx.font = font(700, px); }
        ctx.fillText(it.symbol, b.x, b.y + px * 0.35);
      }
    }
  }

  function frame(now) {
    const dt = Math.min(now - last, 32); last = now;
    if (visible) { step(dt); draw(); }
    requestAnimationFrame(frame);
  }

  function pick(e) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return [...bubbles.values()].reverse().find((b) => Math.hypot(b.x - x, b.y - y) <= b.r)?.item.id ?? null;
  }
  canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = pick(e) ? 'pointer' : 'default'; });
  canvas.addEventListener('click', (e) => onSelect(pick(e)));

  resize();
  requestAnimationFrame(frame);
  return {
    update(list, opts = {}) { items = list; if (opts.sizeBy) sizeBy = opts.sizeBy; retarget(); },
    setSelected(id) { selected = id; },
  };
}

/* ---------- criptomoedas ---------- */
const crypto = { period: '24h', sizeBy: 'change', coins: [], selected: null };
const cryptoDetail = document.getElementById('detail');
const statusEl = document.getElementById('status');
const rowsEl = document.getElementById('rows');
const cryptoChart = createChart(document.getElementById('stage'), { onSelect: (id) => selectCoin(id) });

function refreshCrypto() {
  cryptoChart.update(
    crypto.coins.map((c) => ({ id: c.id, symbol: c.symbol, image: c.image, change: c.change[crypto.period], cap: c.marketCap })),
    { sizeBy: crypto.sizeBy },
  );
  const p = crypto.period;
  document.getElementById('th-change').textContent = `Variação ${p}`;
  const sorted = [...crypto.coins].sort((a, b) => (b.change[p] ?? -Infinity) - (a.change[p] ?? -Infinity));
  rowsEl.innerHTML = sorted.map((c) => {
    const img = safeImg(c.image);
    return `<tr>
      <td><button data-id="${esc(c.id)}">${img ? `<img src="${esc(img)}" alt="">` : ''}<span>${esc(c.name)} <small>${esc(c.symbol)}</small></span></button></td>
      <td class="num">${brl(c.price)}</td>
      <td class="num ${cls(c.change[p])}">${pct(c.change[p])}</td>
      <td class="num">R$ ${big(c.marketCap)}</td></tr>`;
  }).join('');
}

function selectCoin(id) {
  crypto.selected = id; cryptoChart.setSelected(id);
  const c = crypto.coins.find((x) => x.id === id);
  if (!c) { cryptoDetail.hidden = true; return; }
  const img = safeImg(c.image);
  cryptoDetail.innerHTML = `
    <button class="close" aria-label="Fechar detalhes">×</button>
    <header>${img ? `<img src="${esc(img)}" alt="">` : ''}<div><h3>${nameHtml(c.name, c.symbol, 'cripto')}</h3><small>${esc(c.symbol)}${c.tag ? ' · ' + esc(c.tag) : ''}</small></div></header>
    <div class="price">${brl(c.price)}</div>
    <dl>
      ${['1h', '24h', '7d', '30d'].map((p) => `<dt>${p}</dt><dd class="${cls(c.change[p])}">${pct(c.change[p])}</dd>`).join('')}
      <dt>Valor de mercado</dt><dd>R$ ${big(c.marketCap)}</dd>
      <dt>Volume 24h</dt><dd>R$ ${big(c.volume)}</dd>
    </dl>${linksHtml(c.symbol, 'cripto')}`;
  cryptoDetail.hidden = false;
  cryptoDetail.querySelector('.close').addEventListener('click', () => selectCoin(null));
}

rowsEl.addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.id;
  if (id) { selectCoin(id); document.getElementById('stage').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); }
});
bindGroup('period', (v) => { crypto.period = v; refreshCrypto(); if (crypto.selected) selectCoin(crypto.selected); });
bindGroup('size', (v) => { crypto.sizeBy = v; refreshCrypto(); });

async function loadCrypto() {
  try {
    const res = await fetch('/api/coins');
    if (!res.ok) throw new Error();
    const data = await res.json();
    crypto.coins = data.coins;
    if (!crypto.coins.length) {
      statusEl.className = 'status warn';
      statusEl.textContent = 'Nenhuma moeda retornada. Confira os IDs em coins.json.';
    } else {
      const hora = new Date(data.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      statusEl.className = data.stale ? 'status warn' : 'status';
      statusEl.textContent = data.stale ? `Fonte fora do ar; mostrando dados das ${hora}.` : `Atualizado às ${hora}. Atualiza a cada minuto.`;
    }
    refreshCrypto();
    if (crypto.selected) selectCoin(crypto.selected);
  } catch {
    statusEl.className = 'status warn';
    statusEl.textContent = 'Não foi possível carregar os dados. Tentando de novo em 30 segundos.';
    setTimeout(loadCrypto, 30000);
    return;
  }
  setTimeout(loadCrypto, 60000);
}

/* ---------- ações da B3 ---------- */
const stocks = { sizeBy: 'cap', list: [], selected: null };
const stocksDetail = document.getElementById('detail-stocks');
const stocksStatus = document.getElementById('stocks-status');
const stocksChart = createChart(document.getElementById('stage-stocks'), { onSelect: (id) => selectStock(id) });

function refreshStocks() {
  stocksChart.update(
    stocks.list.map((s) => ({ id: s.symbol, symbol: s.symbol, image: s.logo, change: s.changePercent, cap: s.marketCap })),
    { sizeBy: stocks.sizeBy },
  );
  document.getElementById('stocks-sr').innerHTML = stocks.list
    .map((s) => `<li>${s.rank}º ${esc(s.symbol)}, ${esc(s.name)}: ${brl(s.price)}, ${pct(s.changePercent)} no dia, valor de mercado R$ ${big(s.marketCap)}</li>`).join('');
}

function selectStock(id) {
  stocks.selected = id; stocksChart.setSelected(id);
  const s = stocks.list.find((x) => x.symbol === id);
  if (!s) { stocksDetail.hidden = true; return; }
  const img = safeImg(s.logo);
  stocksDetail.innerHTML = `
    <button class="close" aria-label="Fechar detalhes">×</button>
    <header>${img ? `<img src="${esc(img)}" alt="">` : ''}<div><h3>${nameHtml(s.symbol, s.symbol, 'acoes')}</h3><small>${esc(s.name)}</small></div></header>
    <div class="price">${brl(s.price)}</div>
    <dl>
      <dt>Hoje</dt><dd class="${cls(s.changePercent)}">${pct(s.changePercent)} (${s.change > 0 ? '+' : ''}${brl(s.change)})</dd>
      <dt>Valor de mercado</dt><dd>R$ ${big(s.marketCap)}</dd>
      <dt>Volume</dt><dd>R$ ${big(s.volume)}</dd>
      <dt>Posição</dt><dd>${s.rank}º por valor de mercado</dd>
    </dl>${linksHtml(s.symbol, 'acoes')}`;
  stocksDetail.hidden = false;
  stocksDetail.querySelector('.close').addEventListener('click', () => selectStock(null));
}
bindGroup('ssize', (v) => { stocks.sizeBy = v; refreshStocks(); });

async function loadStocks() {
  try {
    const res = await fetch('/api/stocks');
    if (!res.ok) throw new Error();
    const d = await res.json();
    stocks.list = d.stocks;
    refreshStocks();
    if (stocks.selected) selectStock(stocks.selected);
    const hora = new Date(d.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const partes = [d.marketOpen ? 'Mercado aberto' : 'Mercado fechado', `atualizado às ${hora}`, 'cotações com atraso de cerca de 30 min'];
    if (d.partial) partes.push(`mostrando ${d.stocks.length} de ${d.total} ações`);
    stocksStatus.className = d.partial || d.stale ? 'status warn' : 'status';
    stocksStatus.textContent = partes.join(' · ') + '.';
    setTimeout(loadStocks, 300000);
  } catch {
    stocksStatus.className = 'status warn';
    stocksStatus.textContent = 'Cotações indisponíveis no momento. Tentando de novo em 1 minuto.';
    setTimeout(loadStocks, 60000);
  }
}

loadCrypto();
loadStocks();
