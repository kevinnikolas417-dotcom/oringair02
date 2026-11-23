// Promissória schedule math. Dates are "YYYY-MM-DD" strings in America/Sao_Paulo — no UTC drift.
export type Periodicidade = "mensal" | "quinzenal" | "semanal";
export type Installment = {
  id?: string; client_row: number; numero: number; vencimento: string; valor: number;
  data_pagamento: string | null; valor_pago: number | null; forma_pagamento: string; periodicidade?: string;
};

export const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const fmtBR = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addMonthsFixed(first: string, k: number, dia: number) {
  const [y, m] = parts(first);
  const t = (m - 1) + k;
  const yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
  return ymd(yy, mm, Math.min(dia, lastDay(yy, mm)));
}
export function addDays(d: string, n: number) {
  const [y, m, dd] = parts(d);
  const x = new Date(Date.UTC(y, m - 1, dd + n));
  return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}
export function suggestFirst(dia: number, from = todaySP()) {
  const [y, m] = parts(from);
  const cur = ymd(y, m, Math.min(dia, lastDay(y, m)));
  return cur >= from ? cur : addMonthsFixed(ymd(y, m, 1), 1, dia);
}

export function buildSchedule(total: number, entrada: number, n: number, first: string, per: Periodicidade, dia: number) {
  const saldoC = Math.max(0, Math.round((total - entrada) * 100));
  const base = Math.round(saldoC / n);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    vencimento: per === "mensal" ? addMonthsFixed(first, i, dia) : addDays(first, i * (per === "quinzenal" ? 14 : 7)),
    valor: (i === n - 1 ? saldoC - base * (n - 1) : base) / 100,
  }));
}

export function statusOf(i: Installment, today = todaySP()) {
  if (i.data_pagamento) return { s: "pago" as const, dias: 0 };
  if (i.vencimento < today) {
    const [a, b, c] = parts(today), [d, e, f] = parts(i.vencimento);
    return { s: "atrasado" as const, dias: Math.round((Date.UTC(a, b - 1, c) - Date.UTC(d, e - 1, f)) / 864e5) };
  }
  return { s: "pendente" as const, dias: 0 };
}

export function summary(list: Installment[]) {
  const parc = list.filter((i) => i.numero > 0).sort((a, b) => a.numero - b.numero);
  const pagas = parc.filter((i) => i.data_pagamento);
  const totalPago = list.filter((i) => i.data_pagamento).reduce((s, i) => s + Number(i.valor_pago ?? i.valor), 0);
  const devido = parc.reduce((s, i) => s + Number(i.valor), 0);
  const pagoParc = pagas.reduce((s, i) => s + Number(i.valor_pago ?? i.valor), 0);
  const next = parc.find((i) => !i.data_pagamento) ?? null;
  const quitado = parc.length > 0 && !next;
  const quitacao = quitado ? pagas.map((i) => i.data_pagamento!).sort().at(-1)! : null;
  return { parc, pagas: pagas.length, total: parc.length, totalPago, saldo: Math.max(0, devido - pagoParc), next, ultima: parc.at(-1)?.vencimento ?? null, quitado, quitacao };
}
