const TZ = 'America/Sao_Paulo';

// Pregão regular da B3: segunda a sexta, 10h às 18h (horário de Brasília). Feriados não são tratados.
export function marketOpen(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(date).map((x) => [x.type, x.value]),
  );
  const hour = Number(p.hour);
  return !['Sat', 'Sun'].includes(p.weekday) && hour >= 10 && hour < 18;
}

export function validateTickers(list) {
  if (!Array.isArray(list) || list.some((t) => !/^[A-Z0-9]{4,7}$/.test(t))) {
    throw new Error('stocks.json deve ser uma lista de tickers em maiúsculas, ex.: "PETR4"');
  }
}

/** Cotações via brapi.dev. No plano gratuito é 1 ticker por chamada, então são N chamadas por atualização. */
export function createStocks({ tickers, apiUrl, token, openTtlMs, closedTtlMs }) {
  validateTickers(tickers);
  const cache = { at: 0, ttl: 0, data: null, inflight: null, retryAt: 0 };
  const headers = { accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function fetchOne(requested) {
    const url = new URL(`${apiUrl}/stocks/quote`);
    url.searchParams.set('symbols', requested);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`brapi respondeu ${res.status}`);
    const r = (await res.json())?.results?.[0];
    const d = r?.data;
    if (!d) throw new Error('resposta sem dados');
    return {
      requested,
      symbol: r.symbol || requested, // tickers antigos são trocados pelo atual (ex.: ELET3 -> AXIA3)
      name: d.shortName || d.longName || requested,
      price: d.regularMarketPrice ?? null,
      change: d.regularMarketChange ?? null,
      changePercent: d.regularMarketChangePercent ?? null,
      marketCap: d.marketCap ?? null,
      volume: d.regularMarketVolume ?? null,
      logo: d.logourl || '',
      time: d.regularMarketTime || null,
    };
  }

  async function fetchAll() {
    const out = new Array(tickers.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < tickers.length) {
        const k = next++;
        try {
          out[k] = await fetchOne(tickers[k]);
        } catch (e) {
          console.warn(`Falha ao buscar ${tickers[k]}:`, e.message);
          out[k] = cache.data?.stocks.find((s) => s.requested === tickers[k]) ?? null; // mantém o último valor
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    const list = out.filter(Boolean);
    if (!list.length) throw new Error('nenhuma cotação retornada (confira BRAPI_TOKEN)');
    list.sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
    return list.map((s, i) => ({ ...s, rank: i + 1 }));
  }

  async function getStocks() {
    const now = Date.now();
    const open = marketOpen();
    const ttl = open ? openTtlMs : closedTtlMs;
    if (!(cache.data && now - cache.at < ttl) && !cache.inflight && now >= cache.retryAt) {
      cache.inflight = fetchAll()
        .then((stocks) => { cache.data = { updatedAt: new Date().toISOString(), stocks }; cache.at = Date.now(); })
        .catch((err) => { console.error('Falha ao atualizar ações:', err.message); cache.retryAt = Date.now() + 30000; })
        .finally(() => { cache.inflight = null; });
    }
    if (cache.inflight) await cache.inflight;
    if (!cache.data) throw new Error('sem dados');
    return {
      ...cache.data,
      marketOpen: open,
      total: tickers.length,
      partial: cache.data.stocks.length < tickers.length,
      stale: Date.now() - cache.at >= ttl,
    };
  }

  return { getStocks };
}
