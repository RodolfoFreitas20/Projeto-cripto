// Aceita só links https com nome; descarta o resto. Chaves de "ativos" ficam em maiúsculas (símbolo).
export function sanitizeLinks(raw) {
  const clean = (list) => (Array.isArray(list) ? list : []).flatMap((l) => {
    try {
      const u = new URL(l?.url);
      if (u.protocol !== 'https:' || typeof l.nome !== 'string' || !l.nome.trim()) return [];
      return [{ nome: l.nome.trim().slice(0, 40), url: u.href }];
    } catch { return []; }
  });
  const out = { padrao: { cripto: clean(raw?.padrao?.cripto), acoes: clean(raw?.padrao?.acoes) }, ativos: {}, patrocinados: [] };
  for (const [k, v] of Object.entries(raw?.ativos ?? {})) {
    const list = clean(v);
    if (list.length) out.ativos[k.toUpperCase()] = list;
  }
  // Bolhas patrocinadas: clicar abre o link em outra aba. "logo" é um arquivo da pasta public (ex.: /logos/x.png).
  out.patrocinados = (Array.isArray(raw?.patrocinados) ? raw.patrocinados : []).flatMap((p) => {
    try {
      const u = new URL(p?.url);
      if (u.protocol !== 'https:' || typeof p.nome !== 'string' || !p.nome.trim()) return [];
      const logo = typeof p.logo === 'string' && /^\/[\w.\-/]+\.(png|jpe?g|svg|webp)$/i.test(p.logo) && !p.logo.includes('..') ? p.logo : '';
      const secao = ['cripto', 'acoes', 'ambas'].includes(p.secao) ? p.secao : 'cripto';
      return [{ nome: p.nome.trim().slice(0, 30), url: u.href, logo, secao }];
    } catch { return []; }
  });
  return out;
}
