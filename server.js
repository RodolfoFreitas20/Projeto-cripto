import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkets } from './markets.js';
import { createStocks } from './stocks.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const coins = JSON.parse(await readFile(path.join(dir, 'coins.json'), 'utf8'));
const { getMarkets } = createMarkets({
  coins,
  cgUrl: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
  gtUrl: process.env.GECKOTERMINAL_API_URL || 'https://api.geckoterminal.com/api/v2',
  key: process.env.COINGECKO_API_KEY,
  ttlMs: Number(process.env.CACHE_TTL_SECONDS || 60) * 1000,
});

const tickers = JSON.parse(await readFile(path.join(dir, 'stocks.json'), 'utf8'));
const { getStocks } = createStocks({
  tickers,
  apiUrl: process.env.BRAPI_API_URL || 'https://brapi.dev/api/v2',
  token: process.env.BRAPI_TOKEN,
  openTtlMs: Number(process.env.STOCKS_OPEN_TTL_SECONDS || 1800) * 1000, // plano gratuito tem ~30 min de atraso
  closedTtlMs: Number(process.env.STOCKS_CLOSED_TTL_SECONDS || 21600) * 1000,
});

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https://coin-images.coingecko.com https://assets.coingecko.com https://assets.geckoterminal.com https://icons.brapi.dev; " +
      "style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

app.get('/healthz', (req, res) => res.send('ok'));

app.get('/api/coins', async (req, res) => {
  try {
    const data = await getMarkets();
    res.set('Cache-Control', 'public, max-age=30').json(data);
  } catch {
    res.status(503).json({ error: 'Dados indisponíveis no momento.' });
  }
});

app.get('/api/stocks', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60').json(await getStocks());
  } catch {
    res.status(503).json({ error: 'Cotações indisponíveis no momento.' });
  }
});

app.use(express.static(dir, { maxAge: '1h' }));
app.get('/', (req, res) => {
  res.sendFile(path.join(dir, 'index.html'));
});

app.listen(PORT, () => console.log(`Bolhas BR rodando na porta ${PORT}`));
