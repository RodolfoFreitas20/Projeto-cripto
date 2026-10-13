const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const detail = document.getElementById('detail');
const statusEl = document.getElementById('status');
const rowsEl = document.getElementById('rows');

const state = { period: '24h', sizeBy: 'change', coins: [], selected: null };
const bubbles = new Map();
const logos = new Map();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, last = performance.now();

const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n < 1 ? 4 : 2 });
const pct = (n) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`;
const big = (n) => n == null ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const cls = (n) => (n ?? 0) >= 0 ? 'up' : 'down';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeImg = (u) => /^https:\/\/(coin-images|assets)\.(coingecko|geckoterminal)\.com\//.test(u || '') ? u : '';

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  retarget();
}
new ResizeObserver(resize).observe(canvas);

function weight(c) {
  if (state.sizeBy === 'cap') return Math.sqrt(Math.sqrt(c.marketCap || 1)); // suaviza diferenças enormes
  return Math.sqrt(Math.max(Math.abs(c.change[state.period] ?? 0), 0.4));
}

function retarget() {
  if (!W || !H) return;
  const items = state.coins.map((c) => ({ c, w: weight(c) }));
  const sum = items.reduce((s, i) => s + i.w * i.w, 0) || 1;
  const k = Math.sqrt((0.38 * W * H) / (Math.PI * sum));
  const maxR = Math.min(W, H) * 0.3;
  const ids = new Set();
  for (const { c, w } of items) {
    ids.add(c.id);
    let b = bubbles.get(c.id);
    if (!b) {
      b = { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08, r: 8 };
      bubbles.set(c.id, b);
    }
    b.coin = c;
    b.target = Math.min(Math.max(w * k, 26), maxR);
  }
  for (const id of bubbles.keys()) if (!ids.has(id)) bubbles.delete(id);
}

function step(dt) {
  const list = [...bubbles.values()];
  for (const b of list) {
    b.r += (b.target - b.r) * Math.min(1, dt * 0.008);
    if (reduceMotion) continue;
    b.vx += (W / 2 - b.x) * 0.0000025 * dt;
    b.vy += (H / 2 - b.y) * 0.0000025 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vx *= 0.999; b.vy *= 0.999;
    if (Math.hypot(b.vx, b.vy) < 0.015) { const a = Math.random() * 6.283; b.vx += Math.cos(a) * 0.004; b.vy += Math.sin(a) * 0.004; }
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 2;
      if (d >= min) continue;
      const nx = dx / d, ny = dy / d, m1 = a.r * a.r, m2 = b.r * b.r;
      const push = (min - d) / (m1 + m2);
      a.x -= nx * push * m2; a.y -= ny * push * m2;
      b.x += nx * push * m1; b.y += ny * push * m1;
      if (reduceMotion) continue;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j2 = (-1.9 * rv) / (1 / m1 + 1 / m2);
        a.vx -= (j2 * nx) / m1; a.vy -= (j2 * ny) / m1;
        b.vx += (j2 * nx) / m2; b.vy += (j2 * ny) / m2;
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

function logo(url) {
  const u = safeImg(url);
  if (!u) return null;
  if (!logos.has(u)) { const im = new Image(); im.src = u; logos.set(u, im); }
  const im = logos.get(u);
  return im.complete && im.naturalWidth ? im : null;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  for (const b of bubbles.values()) {
    const c = b.coin, ch = c.change[state.period];
    const rgb = (ch ?? 0) >= 0 ? '53,214,160' : '255,111,89';
    const mag = Math.min(Math.abs(ch ?? 0) / 10, 1);
    const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(${rgb},${0.28 + 0.4 * mag})`);
    g.addColorStop(1, `rgba(${rgb},${0.14 + 0.3 * mag})`);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = state.selected === c.id ? 4 : 2;
    ctx.strokeStyle = state.selected === c.id ? '#f4c95d' : `rgba(${rgb},0.9)`; ctx.stroke();

    ctx.fillStyle = '#e8f1ee';
    if (b.r >= 34) {
      const im = logo(c.image), s = b.r * 0.5;
      if (im) ctx.drawImage(im, b.x - s / 2, b.y - b.r * 0.62, s, s);
      ctx.font = `700 ${Math.max(11, b.r * 0.27)}px "Bricolage Grotesque", sans-serif`;
      ctx.fillText(c.symbol, b.x, b.y + b.r * 0.2);
      ctx.font = `400 ${Math.max(10, b.r * 0.2)}px "Bricolage Grotesque", sans-serif`;
      ctx.fillText(pct(ch), b.x, b.y + b.r * 0.2 + Math.max(13, b.r * 0.24));
    } else {
      ctx.font = '700 10px "Bricolage Grotesque", sans-serif';
      ctx.fillText(c.symbol.slice(0, 5), b.x, b.y + 3);
    }
  }
}

function frame(now) {
  step(Math.min(now - last, 32));
  last = now;
  draw();
  requestAnimationFrame(frame);
}

function pick(e) {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  return [...bubbles.values()].reverse().find((b) => Math.hypot(b.x - x, b.y - y) <= b.r)?.coin ?? null;
}
canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = pick(e) ? 'pointer' : 'default'; });
canvas.addEventListener('click', (e) => select(pick(e)?.id ?? null));

function select(id) {
  state.selected = id;
  const c = state.coins.find((x) => x.id === id);
  if (!c) { detail.hidden = true; return; }
  const img = safeImg(c.image);
  detail.innerHTML = `
    <button class="close" aria-label="Fechar detalhes">×</button>
    <header>${img ? `<img src="${esc(img)}" alt="">` : ''}<div><h3>${esc(c.name)}</h3><small>${esc(c.symbol)}${c.tag ? ' · ' + esc(c.tag) : ''}</small></div></header>
    <div class="price">${brl(c.price)}</div>
    <dl>
      ${['1h', '24h', '7d', '30d'].map((p) => `<dt>${p}</dt><dd class="${cls(c.change[p])}">${pct(c.change[p])}</dd>`).join('')}
      <dt>Valor de mercado</dt><dd>R$ ${big(c.marketCap)}</dd>
      <dt>Volume 24h</dt><dd>R$ ${big(c.volume)}</dd>
    </dl>`;
  detail.hidden = false;
  detail.querySelector('.close').addEventListener('click', () => select(null));
}

function renderTable() {
  const p = state.period;
  document.getElementById('th-change').textContent = `Variação ${p}`;
  const sorted = [...state.coins].sort((a, b) => (b.change[p] ?? -Infinity) - (a.change[p] ?? -Infinity));
  rowsEl.innerHTML = sorted.map((c) => {
    const img = safeImg(c.image);
    return `<tr>
      <td><button data-id="${esc(c.id)}">${img ? `<img src="${esc(img)}" alt="">` : ''}<span>${esc(c.name)} <small>${esc(c.symbol)}</small></span></button></td>
      <td class="num">${brl(c.price)}</td>
      <td class="num ${cls(c.change[p])}">${pct(c.change[p])}</td>
      <td class="num">R$ ${big(c.marketCap)}</td></tr>`;
  }).join('');
}
rowsEl.addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.id;
  if (id) { select(id); canvas.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); }
});

function bindGroup(attr, key) {
  document.querySelectorAll(`[data-${attr}]`).forEach((btn) => btn.addEventListener('click', () => {
    state[key] = btn.dataset[attr];
    document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    retarget(); renderTable();
    if (state.selected) select(state.selected);
  }));
}
bindGroup('period', 'period');
bindGroup('size', 'sizeBy');

async function load() {
  try {
    const res = await fetch('/api/coins');
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.coins = data.coins;
    if (!state.coins.length) {
      statusEl.className = 'status warn';
      statusEl.textContent = 'Nenhuma moeda retornada. Confira os IDs em coins.json.';
    } else {
      const hora = new Date(data.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      statusEl.className = data.stale ? 'status warn' : 'status';
      statusEl.textContent = data.stale ? `Fonte fora do ar; mostrando dados das ${hora}.` : `Atualizado às ${hora}. Atualiza a cada minuto.`;
    }
    retarget(); renderTable();
    if (state.selected) select(state.selected);
  } catch {
    statusEl.className = 'status warn';
    statusEl.textContent = 'Não foi possível carregar os dados. Tentando de novo em 30 segundos.';
    setTimeout(load, 30000);
    return;
  }
  setTimeout(load, 60000);
}

resize();
requestAnimationFrame(frame);
load();
