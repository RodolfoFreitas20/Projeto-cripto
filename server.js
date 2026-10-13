import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkets } from './markets.js';

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

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https://coin-images.coingecko.com https://assets.coingecko.com https://assets.geckoterminal.com; " +
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

app.use(express.static(path.join(dir, 'public'), { maxAge: '1h' }));

app.listen(PORT, () => console.log(`Bolhas BR rodando na porta ${PORT}`));
