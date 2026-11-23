export const DEFAULT_RATES_STR = "1:3.2,6:7.8,10:10.5,12:12.5";
export const MAIN_INSTS: readonly number[] = [1, 6, 10, 12];
// Every installment 1x–12x has its own editable rate. Rates the admin never set are
// interpolated between the four main configured ones (1x, 6x, 10x, 12x).
const KNOWN: [number, number][] = [[1, 3.2], [6, 7.8], [10, 10.5], [12, 12.5]];
const knownAt = (n: number) => KNOWN.find(([k]) => k === n)?.[1] ?? 0;
export const DEFAULT_RATES: Record<number, number> = (() => {
  const ks = KNOWN.map(([k]) => k);
  const out: Record<number, number> = {};
  for (let n = 1; n <= 12; n++) {
    if (ks.includes(n)) { out[n] = knownAt(n); continue; }
    const lo = ks.filter((k) => k < n).pop() ?? 1;
    const hi = ks.find((k) => k > n) ?? 12;
    out[n] = Math.round((knownAt(lo) + ((knownAt(hi) - knownAt(lo)) * (n - lo)) / (hi - lo)) * 100) / 100;
  }
  return out;
})();
export const ALL_INSTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const parseRates = (t: string): [number, number][] => {
  const r = (t || "").split(",").map((x) => x.split(":").map(Number) as [number, number])
    .filter(([n, v]) => Number.isFinite(n) && n > 0 && Number.isFinite(v) && v < 100);
  return r.length ? r : parseRates(DEFAULT_RATES_STR);
};
const validRate = (v: unknown): v is number => Number.isFinite(v) && (v as number) >= 0 && (v as number) < 100;
// Completes a partial stored rate map (old links/quotes only carry 1x, 6x, 10x, 12x) with defaults.
export const fillRates = (source: unknown): Record<number, number> => {
  const stored: Record<number, number> = {};
  if (typeof source === "string") parseRates(source).forEach(([n, v]) => { stored[n] = v; });
  else if (Array.isArray(source)) source.forEach((e) => { const [n, v] = e as [number, number]; if (validRate(v)) stored[n] = v; });
  else if (source && typeof source === "object") Object.entries(source).forEach(([k, v]) => {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0 && validRate(v)) stored[n] = v;
  });
  return { ...DEFAULT_RATES, ...stored };
};
const serialize = (rates: Record<number, number>) =>
  Object.entries(rates).map(([n, v]) => [Number(n), v] as const).sort((a, b) => a[0] - b[0]).map(([n, v]) => `${n}:${v}`).join(",");
export const serializeRates = (rates: unknown) => serialize(fillRates(rates));
// The storefront link and saved seller catalogs keep only the four main rates so the
// public vitrine keeps showing 1x, 6x, 10x and 12x as before.
export const serializeMainRates = (rates: unknown) => {
  const full = fillRates(rates);
  return MAIN_INSTS.map((n) => `${n}:${full[n] ?? 0}`).join(",");
};
// Same formula as the Calculator: total = price / (1 − fee), installment = total / n.
export const cardOptions = (price: number, rates: [number, number][]) =>
  rates.map(([n, r]) => { const total = price / (1 - r / 100); return { n, total, parcela: total / n }; });
// Full 1x–12x options from any rate source (string, pairs or partial object).
export const cardOptionsFrom = (price: number, source: unknown) =>
  Object.entries(fillRates(source)).map(([k, r]) => {
    const n = Number(k);
    const total = price / (1 - r / 100);
    return { n, total, parcela: total / n };
  });
