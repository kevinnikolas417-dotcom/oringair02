// Pure price-radar math shared by the admin Radar tab (admin-only data; never used by public/seller pages).
export type RadarOffer = { loja: string; titulo: string; preco: number; link: string; condicao: string; suspeito: boolean };
export type RadarSettings = { estrategia: "mediana" | "abaixo5" | "menor"; delta_menor: number; lucro_min: number; imposto: number; frete: number; folga: number; limite: number };
export type RadarStatus = "Competitivo" | "Acima do mercado" | "Oportunidade de subir" | "Mercado abaixo do meu piso" | "Sem dados";

export const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0, b = sorted[hi] ?? 0;
  return a + (b - a) * (pos - lo);
};

export function analyze(offers: RadarOffer[], meuPreco: number, custo: number, s: RadarSettings) {
  const prices = offers.filter((o) => !o.suspeito).map((o) => o.preco).sort((a, b) => a - b);
  // Same floor as the Calculator: cost + tax% + freight, plus the configured minimum profit.
  const base = custo + custo * (s.imposto / 100) + s.frete;
  const piso = base + s.lucro_min;
  const n = prices.length;
  if (!n) return { n, piso, base, menor: 0, mediana: 0, maior: 0, p25: 0, p75: 0, diff: 0, diffPct: 0, posicao: 0, sugerido: 0, lucro: 0, status: "Sem dados" as RadarStatus };
  const mediana = quantile(prices, 0.5), menor = prices[0] ?? 0, maior = prices[n - 1] ?? 0;
  const alvo = s.estrategia === "mediana" ? mediana : s.estrategia === "abaixo5" ? mediana * 0.95 : menor + s.delta_menor;
  const sugerido = Math.round(Math.max(alvo, piso));
  const diff = meuPreco - mediana, diffPct = mediana ? (diff / mediana) * 100 : 0;
  const posicao = prices.filter((p) => p < meuPreco).length + 1;
  const status: RadarStatus = mediana < piso ? "Mercado abaixo do meu piso"
    : meuPreco > quantile(prices, 0.75) ? "Acima do mercado"
    : meuPreco < mediana * (1 - s.folga / 100) ? "Oportunidade de subir" : "Competitivo";
  return { n, piso, base, menor, mediana, maior, p25: quantile(prices, 0.25), p75: quantile(prices, 0.75), diff, diffPct, posicao, sugerido, lucro: sugerido - base, status };
}
