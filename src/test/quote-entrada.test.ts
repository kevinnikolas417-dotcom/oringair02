import { describe, expect, it } from "vitest";
import { normalizeEntrada, saldoAposEntrada } from "@/lib/quote-entrada";

describe("Valor de entrada do orçamento", () => {
  it("aceita entrada menor que o total e arredonda para 2 casas", () => {
    expect(normalizeEntrada(500, 2000)).toBe(500);
    expect(normalizeEntrada(333.333, 2000)).toBe(333.33);
    expect(normalizeEntrada(0, 2000)).toBe(0);
  });

  it("recusa entrada igual ou maior que o valor total", () => {
    expect(() => normalizeEntrada(2000, 2000)).toThrow("A entrada deve ser menor que o valor total");
    expect(() => normalizeEntrada(2500, 2000)).toThrow("A entrada deve ser menor que o valor total");
  });

  it("calcula o saldo restante após a entrada", () => {
    expect(saldoAposEntrada(500, 2000)).toBe(1500);
    expect(saldoAposEntrada(0, 2000)).toBe(2000);
  });
});
