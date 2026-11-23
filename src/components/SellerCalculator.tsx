import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSellerProducts } from "@/lib/quotes.functions";
import { brl, parseNum } from "@/lib/format";
import { cardOptions, parseRates } from "@/lib/rates";

// Restricted calculator for sellers: only sale price, minimum and card installments.
export function SellerCalculator() {
  const fetchP = useServerFn(getSellerProducts);
  const q = useQuery({ queryKey: ["seller-products"], queryFn: () => fetchP() });
  const [row, setRow] = useState<number | null>(null);
  const [preco, setPreco] = useState("");
  const [entrada, setEntrada] = useState("");
  const products = q.data?.products ?? [];
  const p = products.find((x) => x.row === row) ?? null;
  const rates = useMemo(() => parseRates(q.data?.rates ?? ""), [q.data?.rates]);
  const price = preco.trim() ? parseNum(preco) : p?.venda ?? 0;
  const below = !!p && price < p.minimo - 0.005;
  // Entrada abate do preço: parcelas passam a ser calculadas sobre o saldo restante.
  const entradaVal = Math.round(parseNum(entrada) * 100) / 100;
  const entradaOk = !(entradaVal > 0 && entradaVal >= price);
  const saldo = Math.max(0, price - entradaVal);
  const financeiro = entradaVal > 0 && entradaOk ? saldo : price;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Calculadora</h1>
        <p className="mt-1 font-mono text-[11px] text-dim">escolha um produto do seu catálogo e o preço de venda</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-panel2">
          <div className="panel-head">Produto e preço</div>
          <div className="grid gap-4 p-4">
            <label className="grid gap-1.5 text-sm">Produto
              <select className="field" value={row ?? ""} onChange={(e) => { setRow(e.target.value ? Number(e.target.value) : null); setPreco(""); }}>
                <option value="">{q.isLoading ? "Carregando…" : products.length ? "Selecione…" : "Nenhum produto liberado"}</option>
                {products.map((x) => <option key={x.row} value={x.row}>{x.modelo}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">Preço de venda (R$)
              <input className="field" inputMode="decimal" placeholder={p ? String(p.venda).replace(".", ",") : "0,00"} value={preco} onChange={(e) => setPreco(e.target.value)} disabled={!p} />
            </label>
            <label className="grid gap-1.5 text-sm">Entrada (R$) · opcional
              <input className="field" inputMode="decimal" placeholder="0,00 — abate do valor a parcelar" value={entrada} onChange={(e) => setEntrada(e.target.value)} disabled={!p} />
            </label>
            {!entradaOk && <p className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">A entrada deve ser menor que o valor do aparelho</p>}
            {p && <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-ground p-3"><div className="text-xs text-dim">Preço cadastrado</div><div className="tabular-nums font-semibold">{brl(p.venda)}</div></div>
              <div className="rounded-lg bg-ground p-3"><div className="text-xs text-dim">Preço mínimo permitido</div><div className="tabular-nums font-semibold">{brl(p.minimo)}</div></div>
            </div>}
            {below && <p className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">Abaixo do valor mínimo</p>}
          </div>
        </section>
        <section className="rounded-xl bg-panel2">
          <div className="panel-head">Resultado</div>
          {!p || below || !entradaOk ? <p className="p-6 text-center font-mono text-xs text-dim">{!entradaOk ? "Ajuste a entrada para ver as condições." : below ? "Ajuste o preço para ver as condições." : "Selecione um produto."}</p> : (
            <div className="grid gap-3 p-4">
              <div className="rounded-lg bg-ground p-4"><div className="text-xs text-dim">Pix · à vista</div><div className="text-2xl font-semibold tabular-nums text-acid">{brl(price)}</div></div>
              {entradaVal > 0 && (
                <div className="grid gap-1.5 rounded-lg bg-ground px-4 py-3 text-sm">
                  <div className="flex justify-between tabular-nums"><span>Entrada</span><b>{brl(entradaVal)}</b></div>
                  <div className="flex justify-between tabular-nums"><span>Saldo restante no Pix</span><b className="text-acid">{brl(saldo)}</b></div>
                </div>
              )}
              {cardOptions(financeiro, rates).map((c) => (
                <div key={c.n} className="flex items-center justify-between rounded-lg bg-ground px-4 py-3 text-sm">
                  <span>{c.n}x de <b className="tabular-nums">{brl(c.parcela)}</b></span>
                  <span className="tabular-nums text-dim">total {brl(c.total)}</span>
                </div>
              ))}
              {entradaVal > 0 && <p className="text-xs text-dim">parcelas sobre o saldo de {brl(saldo)} · entrada paga à vista, sem taxa</p>}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
