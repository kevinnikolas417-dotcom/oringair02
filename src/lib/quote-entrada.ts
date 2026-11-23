// Entrada (down payment) rule shared by the quote form preview and the server.
// The entrada abates the total and must leave something left to pay.
export const normalizeEntrada = (raw: number, total: number): number => {
  const e = Math.round(raw * 100) / 100;
  if (e > 0 && e >= total) throw new Error("A entrada deve ser menor que o valor total");
  return e;
};
export const saldoAposEntrada = (entrada: number, total: number): number => Math.max(0, total - entrada);
