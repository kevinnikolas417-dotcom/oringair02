import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { brl, pct, parseNum, toast } from "@/lib/format";
import type { Product } from "@/lib/sheets.functions";
import { ALL_INSTS, DEFAULT_RATES, MAIN_INSTS, fillRates } from "@/lib/rates";
import { saldoAposEntrada } from "@/lib/quote-entrada";

export type Draft = { modelo: string; custo: number; venda: number; lucroTipo: "fixo" | "margem"; lucro: number };


export function Calculator({ products, onSendToCatalog, selected }: { products: Product[]; onSendToCatalog: (d: Draft) => void; selected?: { p: Product; n: number } | null }) {
  const [modelo, setModelo] = useState("");
  const [custo, setCusto] = useState("5000");
  const [imposto, setImposto] = useState("1,5");
  const [frete, setFrete] = useState("20");
  const [mode, setMode] = useState<"fixo" | "margem">("fixo");
  const [lucro, setLucro] = useState("300");
  const [margem, setMargem] = useState("20");
  const [venda, setVenda] = useState("");
  const [entrada, setEntrada] = useState("");
  const [pickRow, setPickRow] = useState("");
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [editRates, setEditRates] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [cliente, setCliente] = useState("");
  const [foto, setFoto] = useState("");

  useEffect(() => {
    try {
      const r = localStorage.getItem("taxas-cartao");
      if (r) setRates(fillRates(JSON.parse(r)));
    } catch { /* ignore */ }
  }, []);
  const updateRate = (n: number, v: string) => {
    const next = { ...rates, [n]: parseNum(v) };
    setRates(next);
    localStorage.setItem("taxas-cartao", JSON.stringify(next));
  };

  const r = useMemo(() => {
    const c = parseNum(custo);
    const total = c + c * (parseNum(imposto) / 100) + parseNum(frete);
    const m = parseNum(margem) / 100;
    const v = parseNum(venda);
    const price = venda.trim() && v > 0 ? v : mode === "fixo" ? total + parseNum(lucro) : m < 1 ? total / (1 - m) : 0;
    const profit = price - total;
    // Entrada abate do preço: as parcelas do cartão passam a ser calculadas sobre o saldo.
    const entradaVal = Math.round(parseNum(entrada) * 100) / 100;
    const saldo = saldoAposEntrada(entradaVal, price);
    const financeiro = entradaVal > 0 ? saldo : price;
    const cards = ALL_INSTS.map((n) => {
      const t = financeiro / (1 - (rates[n] ?? 0) / 100);
      return { n, rate: rates[n] ?? 0, total: t, parcela: t / n };
    });
    // The screen table, WhatsApp message and the 4 main rates stay as before; only the
    // proposal PDF lists every installment from 1x to 12x.
    const main = cards.filter((c) => MAIN_INSTS.includes(c.n));
    return { total, price, profit, margin: price ? (profit / price) * 100 : 0, cards, main, entradaVal, saldo, entradaOk: !(entradaVal > 0 && entradaVal >= price) };
  }, [custo, imposto, frete, mode, lucro, margem, venda, entrada, rates]);

  const fmt = (n: number) => String(n).replace(".", ",");
  const load = (p: Product) => {
    setPickRow(String(p.row));
    setModelo([p.modelo, p.variacao].filter(Boolean).join(" · "));
    setCusto(fmt(p.custo));
    if (p.lucro) {
      setMode(p.lucroTipo);
      if (p.lucroTipo === "margem") setMargem(fmt(p.lucro)); else setLucro(fmt(p.lucro));
    }
    setVenda(p.venda ? fmt(p.venda) : "");
    setFoto(p.foto ?? "");
  };
  const pick = (row: string) => {
    setPickRow(row);
    const p = products.find((x) => String(x.row) === row);
    if (p) load(p);
  };
  useEffect(() => { if (selected) load(selected.p); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const whatsapp = async () => {
    const comEntrada = r.entradaVal > 0 && r.entradaOk;
    const txt = [
      `📱 *${modelo || "Aparelho"}*`, "",
      `💰 *À vista / PIX:* ${brl(r.price)}`,
      ...(comEntrada ? [`💵 *Entrada:* ${brl(r.entradaVal)}`, `💰 *Saldo restante (Pix):* ${brl(r.saldo)}`] : []), "",
      "💳 *Cartão:*",
      ...r.main.map((c) => `${c.n}x de ${brl(c.parcela)}${c.n > 1 ? ` (total ${brl(c.total)})` : ""}`),
      ...(comEntrada ? ["", `parcelas sobre o saldo de ${brl(r.saldo)}`] : []),
    ].join("\n");
    await navigator.clipboard.writeText(txt);
    toast("Copiado para o WhatsApp!");
  };

  return (
    <>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Calculadora de preço</h1>
          <p className="mt-1 font-mono text-[11px] text-dim">custo → imposto → frete → lucro → preço de venda</p>
        </div>
        <span className="font-mono text-[11px] text-dim">BRL · R$</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="rounded-xl bg-panel2 lg:col-span-2">
          <div className="panel-head">Custos &amp; margem</div>
          <div className="grid gap-3 p-4">
            <label><span className="label-mono">Puxar produto da planilha (opcional)</span>
              <select className="field" value={pickRow} onChange={(e) => pick(e.target.value)}>
                <option value="">— selecionar —</option>
                {products.map((p) => <option key={p.row} value={p.row}>{p.modelo} {p.variacao && `· ${p.variacao}`}</option>)}
              </select>
            </label>
            <label><span className="label-mono">Modelo / descrição do aparelho</span>
              <input className="field" placeholder="iPhone 16 Pro Max 256GB" value={modelo} onChange={(e) => { setModelo(e.target.value); setFoto(""); }} /></label>
            <label><span className="label-mono">Custo do aparelho (R$)</span>
              <input className="field" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label-mono">Imposto %</span>
                <input className="field" inputMode="decimal" value={imposto} onChange={(e) => setImposto(e.target.value)} /></label>
              <label><span className="label-mono">Frete R$</span>
                <input className="field" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></label>
            </div>
            <div className="flex rounded-md bg-ground p-1 ring-1 ring-line">
              {(["fixo", "margem"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${mode === m ? "bg-acid/15 text-acid ring-1 ring-acid/30" : "text-dim"}`}>
                  {m === "fixo" ? "Lucro fixo (R$)" : "Margem alvo (%)"}
                </button>
              ))}
            </div>
            {mode === "fixo" ? (
              <label><span className="label-mono">Lucro desejado (R$)</span>
                <input className="field" inputMode="decimal" value={lucro} onChange={(e) => setLucro(e.target.value)} /></label>
            ) : (
              <label><span className="label-mono">Margem alvo (%)</span>
                <input className="field" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} /></label>
            )}
            <label><span className="label-mono">Preço de venda (R$) · opcional</span>
              <input className="field" inputMode="decimal" placeholder="vazio = calcula pelo lucro" value={venda} onChange={(e) => setVenda(e.target.value)} /></label>
            <label><span className="label-mono">Entrada (R$) · opcional</span>
              <input className="field" inputMode="decimal" placeholder="0,00 — abate do valor a parcelar" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></label>
            {!r.entradaOk && <p className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">A entrada deve ser menor que o valor do aparelho</p>}
          </div>
        </section>

        <section className="gridbg rounded-xl bg-panel2 lg:col-span-3">
          <div className="panel-head flex items-center justify-between">
            <span>Resultado</span>
            <button className="normal-case tracking-normal text-dim hover:text-acid" onClick={() => setEditRates((v) => !v)}>⚙ alterar taxas (%)</button>
          </div>
          <div className="p-4">
            <div className="rounded-lg bg-ground p-4 ring-1 ring-acid/20">
              <span className="font-mono text-[11px] text-acid">Preço sugerido · à vista / PIX</span>
              <div className="mt-1 font-mono text-[40px] font-semibold leading-none tracking-tight">{brl(r.price)}</div>
              <span className="mt-1 block font-mono text-[11px] text-dim">lucro líquido {brl(r.profit)} · margem {pct(r.margin)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
              <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Custo total</span>{brl(r.total)}</div>
              <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Lucro</span><span className="text-success">{brl(r.profit)}</span></div>
              <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Margem</span><span className="text-amber">{pct(r.margin)}</span></div>
              <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Imposto sobre venda</span>{brl(r.price * parseNum(imposto) / 100)}</div>
            </div>
            {r.entradaVal > 0 && r.entradaOk && (
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-3">
                <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Preço à vista</span>{brl(r.price)}</div>
                <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Entrada</span>{brl(r.entradaVal)}</div>
                <div className="rounded-md border border-line bg-panel px-3 py-2"><span className="block text-dim">Saldo restante no Pix</span><span className="text-acid">{brl(r.saldo)}</span></div>
              </div>
            )}

            {editRates && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {ALL_INSTS.map((n) => (
                  <label key={n}><span className="label-mono">{n}x taxa %</span>
                    <input className="field" defaultValue={String(rates[n]).replace(".", ",")} onChange={(e) => updateRate(n, e.target.value)} /></label>
                ))}
              </div>
            )}

            <div className="mt-3 overflow-hidden rounded-md ring-1 ring-line">
              <table className="w-full font-mono text-[12px]">
                <thead className="bg-panel text-[10px] uppercase tracking-wider text-dim">
                  <tr><th className="px-3 py-2 text-left font-medium">Parcelas</th><th className="px-3 py-2 text-right font-medium">Valor parcela</th><th className="px-3 py-2 text-right font-medium">Total cartão</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.main.map((c) => (
                    <tr key={c.n}>
                      <td className="px-3 py-2 text-dim">{c.n}x <span className="text-[10px]">({pct(c.rate)})</span></td>
                      <td className="px-3 py-2 text-right">{brl(c.parcela)}</td>
                      <td className={`px-3 py-2 text-right ${c.n === 12 ? "text-amber" : c.n === 1 ? "text-acid" : ""}`}>{brl(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.entradaVal > 0 && r.entradaOk && (
              <div className="mt-2 rounded-md bg-ground p-3 font-mono text-[11px] text-dim">
                <p>parcelas calculadas sobre o saldo de {brl(r.saldo)} · entrada paga à vista, sem taxa</p>
                <p className="mt-1">Total para o cliente (entrada + total no cartão): {r.main.map((c) => `${c.n}x ${brl(r.entradaVal + c.total)}`).join(" · ")}</p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-acid" onClick={() => onSendToCatalog({ modelo, custo: parseNum(custo), venda: Math.round(r.price * 100) / 100, lucroTipo: mode, lucro: parseNum(mode === "fixo" ? lucro : margem) })}>Salvar no catálogo</button>
              <button className="btn-ghost" onClick={whatsapp}>WhatsApp</button>
              <button className="btn-ghost" onClick={() => setShowPdf(true)}>PDF</button>
            </div>
          </div>
        </section>
      </div>

      {showPdf && createPortal(
        <div className="print-modal fixed inset-0 z-50 grid place-items-center bg-ground/80 p-4" onClick={() => setShowPdf(false)}>
          <div className="print-panel max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-panel2 ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
            <div id="proposta" className="p-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-acid">Gestão &amp; Precificação Pro</div>
              <h2 className="mt-2 text-2xl font-semibold">ORÇAMENTO COMERCIAL</h2>
              <p className="font-mono text-xs text-dim">Data: {new Date().toLocaleDateString("pt-BR")}</p>
              <label className="no-print mt-4 block"><span className="label-mono">Nome do cliente (aparece na proposta)</span>
                <input className="field" placeholder="Ex.: Maria Souza" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label>
              {cliente && <div className="mt-4"><div className="text-sm text-dim">Cliente</div><div className="text-lg font-semibold">{cliente}</div></div>}
              <div className="mt-5 text-sm text-dim">Aparelho</div>
              <div className="text-lg font-semibold">{modelo || "—"}</div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm text-dim">Preço à vista / PIX</div>
                  <div className="font-mono text-3xl font-semibold">{brl(r.price)}</div>
                </div>
                {foto && <img src={foto} alt={modelo || "Produto"} width={96} height={96} className="size-24 shrink-0 rounded-lg object-cover" />}
              </div>
              {r.entradaVal > 0 && r.entradaOk && (
                <div className="mt-4 grid gap-1 font-mono text-sm">
                  <div className="flex justify-between"><span className="text-dim">Entrada (à vista)</span><b>{brl(r.entradaVal)}</b></div>
                  <div className="flex justify-between"><span className="text-dim">Saldo restante (Pix)</span><b className="text-acid">{brl(r.saldo)}</b></div>
                </div>
              )}
              <table className="mt-5 w-full font-mono text-sm">
                <thead><tr className="border-b border-line text-left text-dim"><th className="py-2">Cartão</th><th className="py-2 text-right">Parcela</th><th className="py-2 text-right">Total</th></tr></thead>
                <tbody>{r.cards.map((c) => (
                  <tr key={c.n} className="border-b border-line"><td className="py-2">{c.n}x</td><td className="py-2 text-right">{brl(c.parcela)}</td><td className="py-2 text-right">{brl(c.total)}</td></tr>
                ))}</tbody>
              </table>
              {r.entradaVal > 0 && r.entradaOk && <p className="mt-2 font-mono text-xs text-dim">parcelas calculadas sobre o saldo de {brl(r.saldo)} · entrada paga à vista, sem taxa</p>}
            </div>
            <div className="no-print flex justify-end gap-2 border-t border-line p-4">
              <button className="btn-ghost" onClick={() => setShowPdf(false)}>Fechar</button>
              <button className="btn-acid" onClick={() => window.print()}>Salvar como PDF / Imprimir</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
