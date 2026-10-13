const ADDR = /^0x[a-fA-F0-9]{40}$/;
const NET = /^[a-z0-9_-]+$/;
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function validateCoins(coins) {
  if (!Array.isArray(coins)) throw new Error('coins.json deve ser uma lista');
  for (const c of coins) {
    const ok = c.address
      ? ADDR.test(c.address) && NET.test(c.network || '')
      : typeof c.id === 'string' && c.id.length > 0;
    if (!ok) throw new Error(`Entrada inválida em coins.json: ${JSON.stringify(c)}`);
  }
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
  return res.json();
}

/**
 * Tokens com "id" vêm do CoinGecko. Tokens com "network" + "address" (contrato)
 * vêm do GeckoTerminal (preço em USD, convertido para BRL).
 */
export function createMarkets({ coins, cgUrl, gtUrl, key, ttlMs }) {
  validateCoins(coins);
  const cgCoins = coins.filter((c) => !c.address);
  const chainCoins = coins.filter((c) => c.address);
  const meta = new Map(cgCoins.map((c) => [c.id, c]));
  const cgHeaders = key ? { 'x-cg-demo-api-key': key } : {};
  const cache = { at: 0, data: null, inflight: null, retryAt: 0 };
  const keyOf = (c) => `${c.network}:${c.address.toLowerCase()}`;

  async function fromCoinGecko() {
    if (!cgCoins.length) return [];
    const url = new URL(`${cgUrl}/coins/markets`);
    url.search = new URLSearchParams({
      vs_currency: 'brl',
      ids: cgCoins.map((c) => c.id).join(','),
      per_page: '250',
      sparkline: 'false',
      price_change_percentage: '1h,24h,7d,30d',
    });
    const rows = await getJson(url, cgHeaders);
    const found = new Set(rows.map((r) => r.id));
    const missing = [...meta.keys()].filter((id) => !found.has(id));
    if (missing.length) console.warn('IDs sem retorno (confira coins.json):', missing.join(', '));
    return rows.map((r) => ({
      id: r.id,
      symbol: String(r.symbol || '').toUpperCase(),
      name: r.name,
      image: r.image,
      tag: meta.get(r.id)?.tag ?? '',
      price: r.current_price,
      marketCap: r.market_cap,
      volume: r.total_volume,
      change: {
        '1h': r.price_change_percentage_1h_in_currency,
        '24h': r.price_change_percentage_24h_in_currency,
        '7d': r.price_change_percentage_7d_in_currency,
        '30d': r.price_change_percentage_30d_in_currency,
      },
    }));
  }

  async function fromChain(c, usdBrl) {
    const base = `${gtUrl}/networks/${c.network}/tokens/${c.address}`;
    const [tok, pools] = await Promise.all([getJson(base), getJson(`${base}/pools?page=1`)]);
    const a = tok?.data?.attributes;
    if (!a) throw new Error('resposta sem dados do token');
    const pc = pools?.data?.[0]?.attributes?.price_change_percentage ?? {};
    const brl = (v) => (num(v) == null ? null : num(v) * usdBrl);
    return {
      id: keyOf(c),
      symbol: String(c.symbol || a.symbol || '').toUpperCase(),
      name: c.name || a.name,
      image: a.image_url || '',
      tag: c.tag ?? '',
      price: brl(a.price_usd),
      marketCap: brl(a.market_cap_usd), // sem FDV: pode vir vazio em tokens novos
      volume: brl(a.volume_usd?.h24),
      change: { '1h': num(pc.h1), '24h': num(pc.h24), '7d': null, '30d': null }, // a fonte on-chain não traz 7d/30d
    };
  }

  async function fetchAll() {
    const list = await fromCoinGecko();
    if (chainCoins.length) {
      const rate = (await getJson(`${cgUrl}/simple/price?ids=tether&vs_currencies=brl`, cgHeaders))?.tether?.brl;
      if (!rate) throw new Error('sem cotação USD/BRL');
      const results = await Promise.allSettled(chainCoins.map((c) => fromChain(c, rate)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') return list.push(r.value);
        const k = keyOf(chainCoins[i]);
        console.warn(`Falha ao buscar ${k}:`, r.reason?.message);
        const old = cache.data?.coins.find((x) => x.id === k); // mantém o último valor conhecido
        if (old) list.push(old);
      });
    }
    return list;
  }

  async function getMarkets() {
    const now = Date.now();
    if (!(cache.data && now - cache.at < ttlMs) && !cache.inflight && now >= cache.retryAt) {
      cache.inflight = fetchAll()
        .then((list) => {
          cache.data = { updatedAt: new Date().toISOString(), coins: list };
          cache.at = Date.now();
        })
        .catch((err) => {
          console.error('Falha ao atualizar:', err.message);
          cache.retryAt = Date.now() + 15000; // evita martelar as APIs em caso de erro
        })
        .finally(() => { cache.inflight = null; });
    }
    if (cache.inflight) await cache.inflight;
    if (!cache.data) throw new Error('sem dados');
    return { ...cache.data, stale: Date.now() - cache.at >= ttlMs };
  }

  return { getMarkets };
}
