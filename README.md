# Bolhas BR

Site de bolhas (estilo cryptobubbles) só com criptomoedas brasileiras. Backend em Node/Express que consulta o CoinGecko, guarda em cache e serve o front.

## Rodar local
```
npm install
npm start        # http://localhost:3000
```

## Variáveis de ambiente (opcionais)
- `PORT` (padrão 3000)
- `COINGECKO_API_KEY`: chave demo gratuita do CoinGecko; recomendada em produção
- `CACHE_TTL_SECONDS` (padrão 60)
- `BRAPI_TOKEN`: token gratuito de brapi.dev, necessário para as 20 ações (sem token só respondem PETR4, VALE3, ITUB4 e MGLU3)
- `STOCKS_OPEN_TTL_SECONDS` (padrão 1800) e `STOCKS_CLOSED_TTL_SECONDS` (padrão 21600)
- `GECKOTERMINAL_API_URL` (padrão https://api.geckoterminal.com/api/v2)

## Escolher as moedas
Edite `coins.json`. Há dois tipos de entrada:

- **Listada no CoinGecko:** `{ "id": "brz", "tag": "stablecoin" }`. O ID aparece como "API ID" na página da moeda.
  IDs que não retornam dados aparecem no log do servidor ("IDs sem retorno").
- **Só on-chain (por contrato):** `{ "network": "bsc", "address": "0x...", "symbol": "VKX", "tag": "..." }`.
  Os dados vêm do GeckoTerminal, em dólar, convertidos para real (usando o tether como referência do dólar).
  Esse tipo só tem variação de 1h e 24h (7d e 30d ficam vazios) e o valor de mercado pode vir vazio em tokens novos.
  A API gratuita do GeckoTerminal tem limite de uso; com o cache de 60 s, cada token on-chain gasta 2 chamadas por minuto.

Depois de editar, reinicie o servidor. Alguns IDs iniciais da lista foram montados de memória e precisam ser conferidos.

## Ações da B3
A seção "20 maiores ações da B3" usa a brapi.dev. Os tickers ficam em `stocks.json` (um por empresa) e a tabela é ordenada pelo valor de mercado que a API devolve.
A lista inicial é um ponto de partida e **não se atualiza sozinha**: confira o ranking de tempos em tempos e troque os tickers que mudarem.
No plano gratuito da brapi são 15.000 requisições por mês, 1 ticker por chamada e atraso de cerca de 30 min. Cada atualização gasta 20 chamadas, por isso o servidor
só atualiza a cada 30 min durante o pregão (seg-sex, 10h-18h, horário de Brasília) e a cada 6 h fora dele, e só quando alguém acessa o site.

## Deploy no Render (plano gratuito)
Suba a pasta para o GitHub e, no Render, use **New → Blueprint** apontando para o repositório. O `render.yaml` já define o serviço (plano Free, Node, healthcheck em `/healthz`) e pergunta a `COINGECKO_API_KEY` (opcional).
Observação: no plano gratuito o serviço desliga após 15 minutos sem acessos e leva até um minuto para voltar.

## Deploy com Docker
Qualquer host de Node ou Docker (Render, Railway, Fly.io, VPS):
```
docker build -t bolhas-br .
docker run -p 3000:3000 -e COINGECKO_API_KEY=sua_chave bolhas-br
```
Healthcheck: `/healthz`. Coloque atrás de HTTPS (o próprio host costuma fazer isso).
